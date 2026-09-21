# IsoSmartCore como organismo de inspección — ISO/IEC 17020:2026

Estado del trabajo para que Herij (y después otros clientes) puedan acreditarse
como organismo de inspección sobre el mismo SGC ISO 9001 que ya existe.

El capítulo 8 de la norma se cumple con el SGC ISO 9001 por la vía de la
**cláusula 8.1.3** (en la edición 2012 esto se llamaba "Opción B"; esa
nomenclatura ya no existe). La brecha real está en el capítulo 7 (proceso de
inspección) y en la parte del 6 que trata de autorizar y vigilar inspectores,
que es justo lo que ISO 9001 no pide.

El módulo se habilita **por organización y solo lo habilita el super admin**
(migración `20260918120000_iso17020_habilitacion_admin.sql`). El owner lo
**solicita** desde Mi Organización → General; la solicitud aparece en el Panel
de administración (filtro *17020*), donde se aprueba, rechaza o deshabilita y
queda en `admin_audit_log`. Un trigger impide cambiar el campo por fuera de eso.
Las empresas que solo usan ISO 9001 no ven nada nuevo.

## Fases

| # | Fase | Cláusulas | Estado |
|---|------|-----------|--------|
| 1 | Base técnica: alcance, métodos e ítems | 5.2.3 · 7.2 · 7.3 | **Hecha** (2026-09-17) |
| 2 | Inspectores autorizados | 6.1.2 b, d · 6.1.4–6.1.9 | **Hecha** (2026-09-17) |
| 3 | Registro e informe de inspección con dictamen | 6.2.4 · 7.4 · 7.6 | **Hecha** (2026-09-21) |
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

## Decisión tomada: Herij es **tipo no A** (2026-09-17)

La empresa también interviene ítems del mismo tipo que inspecciona, así que
declara tipo no A. La norma no lo prohíbe, pero exige salvaguardas, y la más
dura es el Anexo A.2 b): **quien diseñó, fabricó, instaló, reparó o mantuvo un
ítem no puede inspeccionar ese mismo ítem**.

Para poder aplicar esa regla hay que saber quién intervino cada ítem, y eso no
se registraba en ningún lado. Construido en
`20260917150000_iso17020_salvaguardas_no_a.sql`:

- `item_interventions` — qué hizo la empresa sobre cada ítem (diseño,
  fabricación, instalación, reparación, mantenimiento, modificación), quién lo
  hizo (personal propio o contratista), cuándo y con qué OT de respaldo.
- `item_inspection_restrictions` — vista que responde, por ítem, qué personas
  quedan inhabilitadas y por qué. La fase 3 la va a consultar para **bloquear**
  la asignación de esos inspectores a ese ítem.
- Declaración de tipo y salvaguardas a nivel organización (Configuración), y
  por actividad en el alcance: la edición 2026 permite tipos distintos por
  actividad.

En la pestaña Ítems, cada ítem con intervenciones muestra en rojo quiénes no
pueden inspeccionarlo.

## Alcance inicial decidido (2026-09-17)

Tres actividades, todas sobre juntas soldadas:

| Método | Sigla | Certificación típica |
|--------|-------|----------------------|
| Ultrasonido phased array | PAUT | SNT-TC-1A / ISO 9712 nivel II |
| Líquidos penetrantes | PT | SNT-TC-1A / ISO 9712 nivel II |
| Partículas magnéticas | MT | SNT-TC-1A / ISO 9712 nivel II |

Cada una necesita, antes de la evaluación: su alcance declarado, su método
documentado con los apartados de 7.2.5, al menos un inspector autorizado con
certificación vigente, y observación en campo registrada.

## Fase 2 — qué quedó construido

Migración `20260917160000_iso17020_fase2_inspectores.sql`, módulo `Inspectors.jsx`.

**Certificaciones (6.1.2).** Por método y nivel (PAUT II, PT II, MT II, CWI,
API 510…), con organismo, número, vencimiento y **examen de agudeza visual**,
que en SNT-TC-1A e ISO 9712 vence al año. Avisa las que vencen en 60 días.

**Autorización por método (6.1.2 d / 6.1.4).** Qué puede hacer cada persona
(ejecutar, interpretar, firmar), con qué restricciones, respaldada por una
certificación concreta, y con su **período mentorizado**: mentor, inicio,
cierre, cantidad de inspecciones supervisadas y conclusión del mentor.

**Monitoreo (6.1.5–6.1.8).** Observación en campo, revisión de informes,
reinspección o comparación entre inspectores, con resultado, hallazgos,
necesidad de formación detectada y **efecto sobre la autorización**.

> **Tres automatismos que evitan los hallazgos clásicos:**
> - No se puede activar una autorización con la **certificación vencida**, con
>   la **visión vencida** o con **"No apto"** en el examen visual.
> - No se puede activar sin **cerrar el período mentorizado**.
> - Un monitoreo con efecto *Suspende* **suspende la autorización en el acto**,
>   por trigger. El hallazgo no queda solo escrito.

El estado que se muestra no es el que alguien escribió a mano: sale de la vista
`inspector_authorization_status`, que cruza autorización, certificación, visión
y último monitoreo, y responde si el inspector está habilitado **hoy**.

## Fase 3 — qué quedó construido

Migración `20260921120000_iso17020_fase3_registro_informe.sql`, pestañas
**Inspecciones** e **Informes** dentro de `Inspection.jsx` (`InspectionRecords.jsx`).

**Registro de inspección (7.4.1).** Número único por organización, ítem, método,
cliente y contrato, quién ejecutó y quién lo supervisa si está en mentoría,
equipos con número de serie y sus certificados de calibración, consumibles y
lotes, condición de superficie, condiciones ambientales, cobertura, muestreo
aplicado, criterio de aceptación, desviaciones respecto del método,
limitaciones y dónde quedan los datos crudos. Las indicaciones encontradas se
cargan aparte, cada una con su evaluación contra el criterio.

**Informe con dictamen (7.4.2).** Número único con revisión, conclusión
(Conforme, Conforme con observaciones, No conforme, No concluyente), criterio
contra el que se dictamina, regla de decisión, resumen, recomendaciones,
exclusiones, firma y entrega.

> **Cuatro reglas duras, en la base de datos:**
> - Quien **intervino el ítem no puede inspeccionarlo** (Anexo A.2 b). El
>   selector lo deshabilita y el trigger lo rechaza.
> - No se ejecuta con un **método que no está vigente**, ni con un **inspector
>   sin autorización habilitada** para ese método, salvo que se registre quién
>   lo supervisa durante la mentoría (6.1.4).
> - No se ejecuta sobre un **ítem que no fue verificado como listo** (7.3).
> - **Firma solo quien está autorizado** a interpretar o firmar ese método y
>   está habilitado hoy (6.2.4). Sin criterio declarado no se emite.

**Enmiendas (7.6).** Un informe emitido no se edita: el trigger lo impide. La
corrección se emite como revisión nueva que referencia a la anterior y declara
qué corrige; al emitirla, la anterior pasa a *Reemplazada*, así nunca circulan
dos informes vigentes con el mismo número. Anular exige motivo.

## Decisiones que siguen abiertas

1. **Validación de IsoSmartCore (7.5.1).** El sistema que registra y reporta
   inspecciones debe estar validado y cada cambio autorizado antes de
   implementarse. La norma exime al software comercial de uso general, pero
   conviene no contar con esa exención: hay que armar un expediente de
   validación por versión. Es parte de la fase 5.

## Fuera del software, en paralelo

Seguro de responsabilidad civil dimensionado según el análisis de riesgos
(5.2.4), condiciones contractuales de inspección (5.2.5), política de
imparcialidad y de remuneración (4.1.5, 4.1.7), y la actualización de la
política y los objetivos para incorporar imparcialidad y competencia (8.2).
