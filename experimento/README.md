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
make db && make api
cd api
.venv/bin/python ../experimento/montar.py --corridas 10 --engine gemini   # 20 proyectos: exp-e-1..10, exp-ne-1..10
export GEMINI_API_KEY=...
# correr las 20 líneas generate.py que imprime montar.py (todas con el mismo motor y modelo)
.venv/bin/python ../experimento/plantilla.py --doble 0.3
```

Después:

1. Cada codificador recibe **su** plantilla (`plantilla_A.csv` / `plantilla_B.csv`),
   la guarda como `codificacion_A.csv` / `codificacion_B.csv` y codifica **solo**,
   sin abrir `clave.csv`:
   - `necesidad`: N01…N18 (ver `verdad_de_campo.csv`) o `NINGUNA`
   - `cita_sostiene`: `S` si los turnos citados sostienen el requisito, `N` si no

   El 30 % de los ítems está en las dos plantillas (base del κ); el resto se
   reparte mitad y mitad.
2. Sobre los ítems en común, resuelven los desacuerdos y guardan
   `codificacion/consenso.csv` (mismas columnas, solo esos ítems).
3. `python3 ../experimento/metricas.py` → `resultados/resumen.md` y `por_corrida.csv`
   (media ± d.e., diferencia, δ de Cliff, p de Mann-Whitney exacta y κ).

## Variables

- **VI:** tipo de entrevista (E, NE). **Réplicas:** 10 corridas por condición.
- **Controladas:** stakeholder (ficha fija), modelo (el mismo en las 20 corridas; registrado en `llm_calls`), prompt (`prompts.py`), formato (historias de usuario),
  modo descubrimiento, plataforma.
- **VD:** VD1 cobertura de elicitación, VD2 cobertura de extracción, VD3
  precisión, VD4 ambigüedad, VD5 atomicidad, VD6 trazabilidad válida (definidas
  en `metricas.py`).
- **Covariable registrada:** longitud de la entrevista (E: 58 turnos / 1050
  palabras; NE: 33 turnos / 425 palabras).
