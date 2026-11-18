# Ryo Academy — Design Identity & Visual Contract

> **Authoritative UI Design Specification**  
> **Source of Truth:** `ryo-academy-fe/src/index.css` and `ryo-academy-fe/docs/anti-slop-changes.md`  
> **Scope:** Entire Ryo Academy Frontend Application (`ryo-academy-fe`)

---

## 1. Visual Philosophy & Identity

Ryo Academy is an administrative school ERP designed for high data density, transactional clarity, and rapid administrative workflows. The aesthetic avoids generic SaaS templates (such as purple-gradient cards or generic Inter body copy) in favor of a purposeful, warm-academic editorial aesthetic:

- **Primary Brand Expression:** Warm terracotta / rust red (`hsl(16 74% 45%)`) paired with deep slate-navy surfaces (`hsl(215 35% 18%)`).
- **Data Display:** Dense, highly legible tabular grids, explicit financial decimal alignment, and clear visual hierarchy for monetary amounts.
- **Anti-AI Design Cleanliness:** Zero generic AI placeholders, zero em dashes (`—`), and strict adherence to physical tap targets and WCAG AA contrast.

---

## 2. Typography Specification

Typography is governed by two complementary typefaces imported from Google Fonts:

| Role | Font Family | Tailwind Class | Usage Guidelines |
| :--- | :--- | :--- | :--- |
| **Interface / Body** | `"DM Sans", sans-serif` | `font-sans` | All standard UI text, form inputs, table cells, buttons, and navigation items. |
| **Editorial / Headers** | `"Fraunces", Georgia, serif` | `font-serif` | Page titles, major section headings, institution identity banners, and stat callouts. |
| **Monetary / Code** | `ui-monospace, monospace` | `font-mono` | Currency figures, financial ledger offsets, receipt transaction IDs, and numeric tables. |

---

## 3. Color Palette & Theme Tokens (HSL)

Colors are defined as HSL CSS custom properties in `ryo-academy-fe/src/index.css`:

### 3.1 Core Surface & Content Tokens

```css
--background: 210 32% 97%;         /* Crisp cool off-white canvas */
--foreground: 215 30% 17%;         /* Deep charcoal body text */
--card: 0 0% 100%;                 /* Pure white surface */
--card-foreground: 215 30% 17%;
--border: 214 20% 87%;             /* Subtle structural divider */
--input: 214 20% 83%;              /* Form control boundary */
--ring: 16 74% 45%;                /* Focus ring indicator (matches primary) */
```

### 3.2 Semantic Brand Tokens

```css
--primary: 16 74% 45%;              /* Terracotta brand tone */
--primary-foreground: 0 0% 100%;    /* White high-contrast text */
--secondary: 203 43% 92%;           /* Soft sky-slate container */
--secondary-foreground: 210 50% 24%;/* Deep navy secondary text */
--muted: 210 28% 94%;               /* Inactive/disabled background */
--muted-foreground: 215 16% 40%;    /* Muted label / helper text */
--accent: 43 92% 63%;               /* Warm amber highlight */
--accent-foreground: 34 52% 19%;
--destructive: 1 64% 52%;           /* Crimson warning/reversal */
--destructive-foreground: 0 0% 100%;
```

### 3.3 Navigation & Sidebar Tokens

```css
--sidebar: 215 35% 18%;             /* Deep navy navigation bar */
--sidebar-foreground: 210 25% 91%;  /* High-legibility light text */
--sidebar-border: 215 27% 27%;
--sidebar-primary: 16 74% 45%;     /* Active navigation highlight */
--sidebar-accent: 215 29% 25%;      /* Hover state background */
```

---

## 4. Semantic Status Treatments

Status indicators in tables and badges must use deterministic color treatments:

| Status State | Background Class | Text / Border Class | Typical Entity Examples |
| :--- | :--- | :--- | :--- |
| **Confirmed / Paid** | `bg-emerald-50 dark:bg-emerald-950/40` | `text-emerald-700 border-emerald-200` | Confirmed admission, Paid installment, Present attendance |
| **Pending / Provisional** | `bg-amber-50 dark:bg-amber-950/40` | `text-amber-800 border-amber-200` | Pending payment, Provisional admission, Partial installment |
| **Cancelled / Reversed** | `bg-rose-50 dark:bg-rose-950/40` | `text-rose-700 border-rose-200` | Cancelled admission, Payment reversal, Absent attendance |
| **Superseded / Inactive**| `bg-muted/30` | `text-muted-foreground border-border` | Split root installment, Inactive academic year |

> [!IMPORTANT]
> **Contrast Warning on Inactive Rows:**
> Never apply `opacity-60` to table rows or text. Inactive rows must use a tinted background (`bg-muted/30`) with solid `text-muted-foreground` to preserve WCAG AA 4.5:1 contrast compliance.

---

## 5. Spacing, Radii & Touch Targets

- **Corner Radii:** Base radius is `0.7rem` (`--radius: 0.7rem`).
  - Small elements / badges: `rounded-sm` (`calc(var(--radius) - 4px)`).
  - Cards / Dialogs: `rounded-lg` (`var(--radius)`).
- **Dense Data Grids:** Table rows use compact vertical padding (`py-2` to `py-2.5` on desktop) with clear border separators (`border-b border-border`).
- **Touch Target Accessibility (antislop-human):**
  Interactive controls (action buttons, row menus, checkboxes) must guarantee a minimum 44px tap target on mobile/touch screens:
  ```html
  <button className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center ...">
  ```

---

## 6. Anti-Slop Visual Hygiene Standards

All code and UI contributions must strictly adhere to the project's anti-slop guidelines:

1. **Rule R-02 (Anti-AI Punctuation):**
   - **Zero Em Dashes (`—`):** Never render em dashes in UI text, table fallbacks, badges, or dialogs.
   - Use clean hyphens (`-`), colons, commas, or parentheses instead.
2. **Rule R-01 (Real UI over Mocks):**
   - Do not display static placeholder cards or generic 3-card summary rows when real tables, totals, and filters are required.
3. **Focus Affordances:**
   - All interactive inputs, buttons, and selects must feature prominent focus rings (`focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none`).
4. **Accessible Descriptions:**
   - Checkboxes and toggles must provide accessible descriptions or `aria-label` / `aria-description` attributes.
