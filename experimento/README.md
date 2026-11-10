# Experimento · Hito 2

**Pregunta:** ¿el tipo de entrevista de elicitación (estructurada vs. no
estructurada) afecta la calidad de los requisitos que genera un agente LLM a
partir de su transcripción?

> **Material experimental.** El stakeholder es sintético (`ficha_stakeholder.md`)
> y las dos entrevistas se escribieron a partir de esa ficha. No contienen
> respuestas de personas reales y no deben presentarse como tales.

## Archivos

| Archivo | Qué es |
|---|---|
| `ficha_stakeholder.md` | Perfil y 18 necesidades del stakeholder (fijado antes de las entrevistas) |
| `verdad_de_campo.csv` | Las 18 necesidades, con el turno y el nivel (completa / vaga / ausente) en que aparece cada una en cada entrevista |
| `entrevistas/E_estructurada.txt` | Condición E: guion por bloques + repregunta ante términos vagos |
| `entrevistas/NE_no_estructurada.txt` | Condición NE: sin guion, con errores frecuentes de entrevistador novato |
| `lexico_vago.txt` | Términos vagos para la métrica automática de ambigüedad |
| `montar.py` | Crea las 6 corridas en EchoReq (3 por condición) por la API |
| `plantilla.py` | Arma la plantilla de codificación ciega y su clave |
| `metricas.py` | Calcula VD1–VD6, κ de Cohen y δ de Cliff |

## Pasos

```bash
make db && make api                      # EchoReq arriba, con la migración 019 aplicada
cd api
.venv/bin/python ../experimento/montar.py          # 6 proyectos: exp-e-1..3, exp-ne-1..3
export ANTHROPIC_API_KEY=...
.venv/bin/python generate.py exp-e-1-r1 --project exp-e-1    # … y las otras 5 líneas que imprime montar.py
.venv/bin/python ../experimento/plantilla.py
```

Después:

1. Dos integrantes copian `codificacion/plantilla.csv` como `codificacion_A.csv`
   y `codificacion_B.csv` y codifican **por separado**, sin abrir `clave.csv`:
   - `necesidad`: N01…N18 (ver `verdad_de_campo.csv`) o `NINGUNA`
   - `cita_sostiene`: `S` si los turnos citados sostienen el requisito, `N` si no
2. Se juntan, resuelven los desacuerdos y guardan `codificacion/consenso.csv`.
3. `python3 ../experimento/metricas.py` → `resultados/resumen.md` y `por_corrida.csv`.

## Variables

- **VI:** tipo de entrevista (E, NE).
- **Controladas:** stakeholder (ficha fija), modelo (`claude-opus-5`, fijado en
  `claude_engine.py`), prompt (`prompts.py`), formato (historias de usuario),
  modo descubrimiento, plataforma.
- **VD:** VD1 cobertura de elicitación, VD2 cobertura de extracción, VD3
  precisión, VD4 ambigüedad, VD5 atomicidad, VD6 trazabilidad válida (definidas
  en `metricas.py`).
- **Covariable registrada:** longitud de la entrevista (E: 58 turnos / 1050
  palabras; NE: 33 turnos / 425 palabras).
