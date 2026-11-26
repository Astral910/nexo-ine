"""Une el video grabado con la narración y subtítulos (ffmpeg, codificación por GPU con NVENC si está disponible)."""

import json
import subprocess
from pathlib import Path

AQUI = Path(__file__).resolve().parent
TMP = AQUI / "_tmp"
marcas = json.loads((TMP / "marcas.json").read_text(encoding="utf-8"))
crudo = next(TMP.glob("*.webm"))
dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(crudo)]).decode())


def buscar_portada() -> float:
    """Primer cuadro azul (la portada) tras los cuadros en blanco: ahí empieza el reloj del guion."""
    from PIL import Image

    carpeta = TMP / "cuadros"
    carpeta.mkdir(exist_ok=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-t", "8", "-i", str(crudo), "-vf", "fps=25,scale=64:36",
                    str(carpeta / "c%04d.png")], check=True)
    for k, f in enumerate(sorted(carpeta.glob("c*.png"))):
        r, g, b = (sum(c) / len(c) for c in zip(*Image.open(f).convert("RGB").getdata()))
        if b > 90 and r < 60:
            return k / 25
    return 0.0


desfase = buscar_portada()


def hms(t):
    h, r = divmod(t, 3600)
    m, s = divmod(r, 60)
    return f"{int(h):02d}:{int(m):02d}:{s:06.3f}".replace(".", ",")


# Subtítulos: cada narración partida en renglones de hasta ~70 caracteres, repartidos en su duración.
srt, n = [], 1
for m in marcas:
    palabras, bloques, actual = m["texto"].split(), [], ""
    for w in palabras:
        if len(actual) + len(w) + 1 > 70 and actual:
            bloques.append(actual)
            actual = w
        else:
            actual = f"{actual} {w}".strip()
    bloques.append(actual)
    total = sum(len(b) for b in bloques)
    t = m["inicio"] + desfase + 0.15
    for b in bloques:
        d = m["dur"] * len(b) / total
        srt.append(f"{n}\n{hms(t)} --> {hms(t + d)}\n{b}\n")
        n, t = n + 1, t + d
(TMP / "subtitulos.srt").write_text("\n".join(srt), encoding="utf-8")

entradas = ["-i", str(crudo)]
filtros = []
for i, m in enumerate(marcas, start=1):
    entradas += ["-i", str(AQUI / "voz" / f"{m['id']}.mp3")]
    ms = int((m["inicio"] + desfase + 0.15) * 1000)
    filtros.append(f"[{i}:a]adelay={ms}|{ms}[a{i}]")
filtros.append("".join(f"[a{i}]" for i in range(1, len(marcas) + 1)) + f"amix=inputs={len(marcas)}:normalize=0,alimiter=limit=0.89[voz]")
estilo = "FontName=Segoe UI,FontSize=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BorderStyle=3,Outline=1,Shadow=0,MarginV=36"
filtros.append(f"[0:v]subtitles=_tmp/subtitulos.srt:force_style='{estilo}',format=yuv420p[v]")
salida = AQUI.parents[1] / "entregables" / "02-video-demostrativo.mp4"


def codificar(codec):
    extra = ["-c:v", "h264_nvenc", "-preset", "p5", "-cq", "23"] if codec == "nvenc" else ["-c:v", "libx264", "-crf", "22", "-preset", "medium"]
    return subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *entradas, "-filter_complex", ";".join(filtros), "-map", "[v]", "-map", "[voz]",
                           *extra, "-r", "30", "-c:a", "aac", "-b:a", "160k", "-t", f"{min(dur - desfase, marcas[-1]['fin'] + 1.0):.2f}", "-ss", f"{desfase:.2f}",
                           "-movflags", "+faststart", str(salida)], cwd=AQUI)


if codificar("nvenc").returncode != 0:
    codificar("cpu")
print("Listo:", salida, f"(desfase {desfase:.2f} s)")
