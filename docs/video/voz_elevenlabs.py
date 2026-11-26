"""Genera la narración del video con ElevenLabs (voz predeterminada «Liam – Energetic», modelo multilingüe en español).

Uso:  ELEVENLABS_API_KEY=... python voz_elevenlabs.py [id-de-escena ...]
La clave se lee de la variable de entorno y nunca se guarda en el repositorio. Sin argumentos genera todas las
escenas de guion.json y anota su duración. ElevenLabs solo se usa para producir el video: Nexo no lo usa.
"""

import json
import os
import subprocess
import sys
from pathlib import Path

import httpx

AQUI = Path(__file__).resolve().parent
VOZ = "TX3LPaxmHKxFdv7VOQHJ"  # Liam: el plan gratuito solo permite voces predeterminadas por la API
AJUSTES = {"stability": 0.32, "similarity_boost": 0.8, "style": 0.5, "use_speaker_boost": True, "speed": 1.06}

clave = os.environ["ELEVENLABS_API_KEY"]
guion = json.loads((AQUI / "guion.json").read_text(encoding="utf-8"))
elegidas = set(sys.argv[1:])
(AQUI / "voz").mkdir(exist_ok=True)
with httpx.Client(timeout=120) as cliente:
    for e in guion:
        if elegidas and e["id"] not in elegidas:
            continue
        r = cliente.post(f"https://api.elevenlabs.io/v1/text-to-speech/{VOZ}", params={"output_format": "mp3_44100_128"},
                         headers={"xi-api-key": clave}, json={"text": e["texto"], "model_id": "eleven_multilingual_v2", "language_code": "es",
                                                              "voice_settings": AJUSTES})
        if r.status_code != 200:
            sys.exit(f"{e['id']}: {r.status_code} {r.text[:300]}")
        destino = AQUI / "voz" / f"{e['id']}.mp3"
        destino.write_bytes(r.content)
        e["dur"] = round(float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of",
                                                         "csv=p=0", str(destino)]).decode()), 2)
        print(e["id"], e["dur"])
(AQUI / "guion.json").write_text(json.dumps(guion, ensure_ascii=False, indent=1), encoding="utf-8")
print("total", round(sum(e.get("dur", 0) for e in guion), 1))
