# ISO 9001 Implementation Roadmap

This plan outlines the steps to move IsoSmartCore from its current state to a fully deployable, ISO 9001:2015 compliant QMS platform.

## Phase 1: Operational Excellence (Closing the Gap)
**Goal:** Implement the missing modules for Clause 8 (Operation) to allow the system to track actual work, not just policy.

### 1.1 New Module: Customer Requirements (Clause 8.2)
*   **Purpose:** Capture orders, contracts, or project requirements.
*   **Database Table:** `customer_requirements` (id, client_name, request_date, details, status, review_evidence).
*   **UI Component:** `CustomerOrders.jsx`.

### 1.2 New Module: Operations Control (Clause 8.5)
*   **Purpose:** Track the execution of work (e.g., Job Travelers, Service Logs).
*   **Database Table:** `production_logs` (id, order_id, step, operator_id, date, status, notes).
*   **UI Component:** `OperationsLog.jsx`.

### 1.3 New Module: QC Release (Clause 8.6)
*   **Purpose:** Final inspection before delivery.
*   **Database Table:** `qc_releases` (id, order_id, inspector_id, date, checklist_result, approved).
*   **UI Component:** `QualityControl.jsx`.

## Phase 2: Technical Modernization
**Goal:** Improve user experience and maintainability.

### 2.1 Navigation Refactor
*   **Action:** Replace `vistaActual` state in `App.jsx` with `react-router-dom`.
*   **Benefit:** Enables URL sharing (e.g., `/risks/123`), browser history support (Back button), and better code splitting.
*   **Routes:**
    *   `/dashboard`
    *   `/context`
    *   `/risks`
    *   `/documents`
    *   ...etc.

### 2.2 Component Optimization
*   **Action:** Extract reusable UI components (Cards, Tables, Modals) into a `components/ui` folder.
*   **Current State:** Many components define their own styles and modal logic internally.

## Phase 3: Deployment & Security
**Goal:** Secure the application and make it accessible.

### 3.1 Database Security (RLS)
*   **Action:** Review `iso_migration_v1.sql` and ensure `ENABLE ROW LEVEL SECURITY` is set for all tables.
*   **Policy:** Create policies that allow:
    *   `SELECT` for authenticated users (or specific roles).
    *   `INSERT/UPDATE` for authorized users.

### 3.2 Environment Configuration
*   **Action:** Create `.env.production` setup guide.
*   **Variables:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GEMINI_API_KEY`.

## Phase 4: Launch Checklist
- [ ] Run full migration script on production Supabase instance.
- [ ] Verify AI API keys are active and funded.
- [ ] Conduct User Acceptance Testing (UAT) with a sample workflow:
    1.  Create Context Factor (AI assisted).
    2.  Create Risk (AI assisted).
    3.  Log a "Customer Order" (New Module).
    4.  Complete "Operations Log" (New Module).
    5.  Release via "QC" (New Module).
    6.  Check Audit Logs.
