# IsoSmartCore como organismo de inspección — ISO/IEC 17020:2026

Estado del trabajo para que Herij (y después otros clientes) puedan acreditarse
como organismo de inspección sobre el mismo SGC ISO 9001 que ya existe.

El capítulo 8 de la norma se cumple con el SGC ISO 9001 por la vía de la
**cláusula 8.1.3** (en la edición 2012 esto se llamaba "Opción B"; esa
nomenclatura ya no existe). La brecha real está en el capítulo 7 (proceso de
inspección) y en la parte del 6 que trata de autorizar y vigilar inspectores,
que es justo lo que ISO 9001 no pide.

El módulo se habilita **por organización**: Configuración → General → *Habilitar
módulos de inspección*. Las empresas que solo usan ISO 9001 no ven nada nuevo.

## Fases

| # | Fase | Cláusulas | Estado |
|---|------|-----------|--------|
| 1 | Base técnica: alcance, métodos e ítems | 5.2.3 · 7.2 · 7.3 | **Hecha** (2026-09-17) |
| 2 | Inspectores autorizados | 6.1.2 b, d · 6.1.4–6.1.9 | Pendiente |
| 3 | Registro e informe de inspección con dictamen | 6.2.4 · 7.4 · 7.6 | Pendiente |
| 4 | Imparcialidad, apelaciones y quejas | 4.1 · 4.2 · 5.1 · Anexo A · 7.7 · 7.8 | Pendiente |
| 5 | Validez de resultados y datos | 6.2.9–6.2.10 · 7.2.6 · 7.5 · 8.4.3 · 8.5.3 | Pendiente |

El orden es de dependencia, no de importancia: un informe no se firma sin un
inspector autorizado, y un inspector se autoriza para un método que tiene que
existir antes.

## Fase 1 — qué quedó construido

Migración `20260917140000_iso17020_fase1_base_tecnica.sql`, módulo `Inspection.jsx`.

**Alcance técnico por actividad (5.2.3).** Campo, tipos de ítem, rango, etapa del
ítem y normas de referencia con su edición. Cada actividad declara además su
**tipo de independencia** (A o no A), que la edición 2026 permite fijar por
actividad y no solo para todo el organismo. Marca las actividades que todavía no
tienen ningún método: esas no se pueden ejecutar.

**Catálogo de métodos (7.2).** Distingue norma publicada, norma modificada y
método propio. Cada método tiene los apartados que exige 7.2.5: técnica,
equipos (señalando cuáles influyen en el resultado), plan de muestreo con su
justificación, información que aporta el cliente, tecnología o IA empleada,
seguridad y criterio de decisión.

> **Regla dura:** un método modificado o propio **no puede quedar vigente sin
> estar validado** (7.2.6). Está aplicado en la interfaz y también con un trigger
> en la base de datos, así que no se puede saltear por fuera de la app.

La IA redacta un borrador del contenido del método a partir de la norma de
referencia y el alcance, y solo completa los campos vacíos.

**Ítems (7.3).** Identificación única obligatoria por organización (la base lo
impide duplicar), datos técnicos, verificación registrada de que el ítem está
**listo** antes de inspeccionarlo (quién y cuándo) y notas de cuidado para
evitar deterioro mientras está bajo custodia del organismo.

## Decisiones que siguen abiertas

1. **Tipo de independencia de Herij.** ¿La empresa diseña, fabrica, instala,
   repara o mantiene alguno de los ítems que inspecciona? Si no, es Tipo A. Si
   sí, es no A y aplica la salvaguarda de que quien mantiene no inspecciona el
   mismo ítem. Ya se puede declarar por actividad en el módulo.
2. **Alcance inicial a acreditar.** Conviene arrancar angosto (por ejemplo
   espesores por ultrasonido e inspección visual de soldadura) porque cada
   actividad arrastra métodos, inspectores autorizados y formato de informe.
3. **Validación de IsoSmartCore (7.5.1).** El sistema que registra y reporta
   inspecciones debe estar validado y cada cambio autorizado antes de
   implementarse. La norma exime al software comercial de uso general, pero
   conviene no contar con esa exención: hay que armar un expediente de
   validación por versión. Es parte de la fase 5.

## Fuera del software, en paralelo

Seguro de responsabilidad civil dimensionado según el análisis de riesgos
(5.2.4), condiciones contractuales de inspección (5.2.5), política de
imparcialidad y de remuneración (4.1.5, 4.1.7), y la actualización de la
política y los objetivos para incorporar imparcialidad y competencia (8.2).
