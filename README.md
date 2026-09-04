# IsoSmartCore

SaaS multi-tenant para gestión del Sistema de Gestión de Calidad ISO 9001:2015. Construido con React 19 + Vite + Supabase, con IA contextual (Gemini) integrada en cada módulo para asistir a gerentes de calidad y auditores.

Producción: [isosmartcore.com](https://isosmartcore.com)

---

## Qué hace

- **21 módulos ISO 9001:2015 completos**: Contexto (4), Liderazgo (5), Planificación (6), Soporte (7), Operación (8), Evaluación (9), Mejora (10).
- **Multi-tenant** con RLS estricta por org: cada empresa ve solo sus datos.
- **RAG Copilot** con contexto real de cada org: retrieval sobre `rag_chunks` (pgvector 768-dim) + snapshot del SGC + generación con `gemini-3.6-flash`.
- **Portal operativo separado** para roles comercial/producción/QC (`operator`) con timeline de eventos y evidencias documentales (archivos + links externos).
- **Detector de segregación de funciones** (ISO 5.3 / 7.1.2): cuando la misma persona aprueba y libera un pedido, queda registrado como hallazgo para auditoría.
- **Modo impersonar** para super-admin: soporte técnico ve la app tal como la ve el cliente, sin poder escribir.
- **Auditor externo** por link temporal hasheado (SHA-256) con caducidad y max_uses.
- **Contabilidad de tokens/costo IA** por org (tabla `ai_usage_log`) — base para futura facturación por consumo.

## Stack

- **Frontend**: React 19, Vite 7, `@supabase/supabase-js`, `lucide-react`, `jspdf`, `exceljs`
- **Backend**: Supabase (Postgres 15 + Auth + Storage + Edge Functions Deno)
- **IA**: Google Gemini API (chat, embeddings) con fallback multi-modelo y auto-parseo de deprecations
- **Deploy**: Vercel (frontend) + Supabase Cloud (backend) + Cloudflare DNS

## Estructura del repo

```
src/
├── App.jsx                    # Router + AppShell + sidebar
├── OrgContext.jsx             # Contexto de org activa, rol, impersonate
├── Copilot.jsx                # Chat IA con RAG (FAB flotante)
├── Dashboard.jsx              # Tablero de madurez SGC
├── BandejaOperativa.jsx       # Home del rol operator
├── SegregacionPanel.jsx       # Auditor: conflictos same_person
├── {ContextAnalysis, Stakeholders, ...}.jsx  # 20+ módulos ISO
├── components/
│   └── WorkOrderTimeline.jsx  # Timeline de eventos + evidencias
└── lib/
    ├── roles.js               # Definición de roles + permisos
    ├── computeImplementation.js  # Cálculo % madurez SGC (Dashboard + Copilot)
    ├── workOrderEvents.js     # API layer timeline
    ├── sanitizePrompt.js      # Anti prompt-injection
    └── humanizeDbError.js     # Traducción de errores Postgres al usuario

supabase/
├── config.toml                # Config CLI + verify_jwt por función
├── migrations/                # Migraciones nuevas (formato CLI)
├── migrations_archive/        # Baseline histórico v1-v67 (pre-CLI). Ver README ahí.
└── functions/
    ├── _shared/aiUsage.ts     # Logging de consumo IA compartido
    ├── copilot-chat/          # RAG orchestrator (embed → retrieve → generate)
    ├── gemini-proxy/          # Proxy autenticado a Gemini con quota + costos
    ├── embed-and-index/       # Post-save: embed 1 row → rag_chunks
    ├── rag-backfill/          # Batch: embeddear toda la org
    └── ai-health-check/       # Cron diario: verifica modelos vivos
```

## Setup local

Requisitos: Node 20+, `npm`, cuenta Supabase.

```bash
npm install
cp .env.example .env       # completar con VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm run dev                # http://localhost:3173
```

Para hacer cambios en el schema de DB, usar migraciones nuevas en `supabase/migrations/` con el formato `YYYYMMDDHHMMSS_descripcion.sql`. Ver `SETUP_SUPABASE_CLI.md`.

Para levantar un ambiente vírgen (proyecto Supabase nuevo), ver `DEPLOY.md` y el README de `supabase/migrations_archive/`.

## Roles

| Rol               | Icono | Qué hace                                                              |
|-------------------|-------|-----------------------------------------------------------------------|
| `owner`           | 👑   | Dueño. Todo + gestión de equipo + facturación.                        |
| `quality_manager` | 🛡️   | Gestor de calidad. CRUD en todos los módulos ISO. Sin facturación.    |
| `auditor`         | 🔍   | Lee todo. Edita solo auditorías internas y hallazgos.                 |
| `operator`        | 🛠️   | Comercial / producción / QC. Pedidos, avances, liberaciones.          |
| `viewer`          | 👁️   | Solo lectura.                                                         |

## Comandos

```bash
npm run dev       # dev server en :3173
npm run build     # build de producción a /dist
npm run preview   # servir /dist localmente
npm run lint      # ESLint
```

## Documentación adicional

- `DEPLOY.md` — Guía completa de deploy a producción.
- `SETUP_SUPABASE_CLI.md` — Setup del CLI + flujo de migraciones.
- `SETUP_RESEND.md` — Config del proveedor SMTP para invitaciones/reset.
- `SETUP_WARMUP.md` — Cron de warmup para evitar cold-starts de Supabase Free.
- `IMPLEMENTATION_PLAN.md` — Roadmap histórico del producto.
- `IA_FEASIBILITY_ISO9001.md` — Análisis de dónde encaja IA en cada cláusula.
- `AUDIT_REPORT_ISO9001.md` — Verificación funcional contra la norma.

## Licencia

Propietario. © Herij Cía. Ltda. Ecuador.
