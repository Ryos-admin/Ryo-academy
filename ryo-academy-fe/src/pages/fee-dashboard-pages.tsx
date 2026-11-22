import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { ChevronDown, Search, ArrowLeft, ArrowRight, X } from "lucide-react";
import { type User, hasPermission } from "@/lib/mock-erp";
import { useSchoolConfiguration } from "@/lib/schools-api";
import { useFeeDashboard } from "@/lib/fee-dashboard-api";
import { usePrograms } from "@/lib/programs-api";
import { useClasses } from "@/lib/classes-api";
import { PageHeader, Loading, Empty, Status, date } from "@/pages/page-primitives";

export function FeeManagementDashboardPage({ session }: { session: User }) {
  const [, setLocation] = useLocation();
  const schoolConfig = useSchoolConfiguration();
  const canConfigure = hasPermission(session, "SCHOOL_UPDATE");

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [classId, setClassId] = useState("");
  const [programId, setProgramId] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const programsQuery = usePrograms();
  const classesQuery = useClasses();

  // Debounce search input by 300ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  // Reset page to 1 on search or filter change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, classId, programId]);

  const isConfigured = Boolean(
    schoolConfig.data?.isConfigured &&
      !schoolConfig.data.isInvalid &&
      schoolConfig.data.activeAcademicYearId,
  );

  const dashboardQuery = useFeeDashboard(
    {
      page,
      pageSize,
      search: debouncedSearch.trim() || undefined,
      classId: classId || undefined,
      programId: programId || undefined,
    },
    isConfigured,
  );

  const programs = programsQuery.data || [];
  const classes = classesQuery.data || [];

  const handleClearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setClassId("");
    setProgramId("");
    setPage(1);
  };

  const hasActiveFilters = Boolean(search || classId || programId);

  // Configuration Loading State
  if (schoolConfig.isLoading) {
    return (
      <>
        <PageHeader
          eyebrow="Financial Operations"
          title="Fee Management Dashboard"
          description="Confirmed admissions and billing overview for the configured academic year."
        />
        <Loading label="Loading school configuration..." />
      </>
    );
  }

  // Configuration Error State
  if (schoolConfig.isError) {
    return (
      <>
        <PageHeader
          eyebrow="Financial Operations"
          title="Fee Management Dashboard"
          description="Confirmed admissions and billing overview for the configured academic year."
        />
        <Empty
          title="Unable to load configuration"
          detail="Could not retrieve the school's academic year configuration. Please check your connection and refresh."
        />
      </>
    );
  }

  // School Not Configured State
  if (!schoolConfig.data?.isConfigured && !schoolConfig.data?.isInvalid) {
    return (
      <>
        <PageHeader
          eyebrow="Financial Operations"
          title="Fee Management Dashboard"
          description="Confirmed admissions and billing overview for the configured academic year."
        />
        <Empty
          title="No Academic Year Configured"
          detail="A school-wide academic year has not been set yet. Confirmed admissions cannot be displayed until an active academic year is selected in the school profile."
          action={
            canConfigure ? (
              <Link
                href="/profile"
                data-testid="link-configure-profile"
                className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Configure in Profile
              </Link>
            ) : undefined
          }
        />
      </>
    );
  }

  // Invalid Configuration State (soft-deleted or inactive academic year)
  if (schoolConfig.data?.isInvalid) {
    return (
      <>
        <PageHeader
          eyebrow="Financial Operations"
          title="Fee Management Dashboard"
          description="Confirmed admissions and billing overview for the configured academic year."
        />
        <div
          className="rounded-md bg-destructive/10 p-4 text-sm text-destructive font-medium mb-6 flex items-center justify-between"
          data-testid="dashboard-invalid-alert"
        >
          <span>
            The configured academic year is inactive or has been deleted.
            Please reconfigure the active academic year in your profile.
          </span>
          {canConfigure && (
            <Link
              href="/profile"
              data-testid="link-reconfigure-profile"
              className="underline font-semibold ml-4 whitespace-nowrap"
            >
              Update in Profile
            </Link>
          )}
        </div>
        <Empty
          title="Invalid Academic Year Configuration"
          detail="The previously selected academic year is no longer active. Reconfiguration is required to display confirmed admissions."
        />
      </>
    );
  }

  const activeYearName = schoolConfig.data?.activeAcademicYear?.name || "Active Year";
  const data = dashboardQuery.data?.data || [];
  const total = dashboardQuery.data?.total || 0;
  const totalPages = dashboardQuery.data?.totalPages || 0;
  const startRecord = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endRecord = Math.min(page * pageSize, total);

  return (
    <>
      <PageHeader
        eyebrow="Financial Operations"
        title="Fee Management Dashboard"
        description="Confirmed admissions and billing overview for the configured academic year."
        action={
          <div
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold"
            data-testid="active-ay-badge"
          >
            <span className="live-dot" />
            <span>{activeYearName}</span>
          </div>
        }
      />

      {/* Toolbar / Filters */}
      <div className="list-toolbar">
        <label className="search-box">
          <Search size={16} />
          <input
            data-testid="dashboard-search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by student or admission #..."
            aria-label="Search admissions"
          />
        </label>

        <div className="toolbar-right">
          <label className="filter-box">
            <span>Program</span>
            <select
              data-testid="dashboard-program-filter"
              value={programId}
              onChange={(e) => setProgramId(e.target.value)}
              aria-label="Filter by program"
            >
              <option value="">All Programs</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <ChevronDown size={14} />
          </label>

          <label className="filter-box">
            <span>Class</span>
            <select
              data-testid="dashboard-class-filter"
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              aria-label="Filter by class"
            >
              <option value="">All Classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <ChevronDown size={14} />
          </label>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClearFilters}
              data-testid="dashboard-clear-filters"
              className="inline-flex h-10 items-center gap-1 rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              <X size={14} />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Query Data Display */}
      {dashboardQuery.isLoading ? (
        <Loading label="Loading confirmed admissions..." />
      ) : dashboardQuery.isError ? (
        <Empty
          title="Could not load admissions"
          detail="An error occurred while retrieving admissions for the configured academic year. Please try again."
        />
      ) : data.length === 0 ? (
        <Empty
          title="No confirmed admissions found"
          detail={
            hasActiveFilters
              ? "No confirmed admissions match the selected filter criteria."
              : `There are no confirmed admissions recorded for ${activeYearName}.`
          }
        />
      ) : (
        <div className="table-card" data-testid="dashboard-table-card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Admission #</th>
                  <th scope="col">Student Name</th>
                  <th scope="col">Program</th>
                  <th scope="col">Class &amp; Section</th>
                  <th scope="col">Confirmed Date</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.map((item) => {
                  const classSection = item.class?.name
                    ? `${item.class.name}${item.section?.name ? ` · ${item.section.name}` : ""}`
                    : "—";

                  return (
                    <tr
                      key={item.id}
                      data-testid={`admission-row-${item.id}`}
                      className="cursor-pointer"
                      onClick={() => setLocation(`/admissions/${item.id}`)}
                    >
                      <td>
                        <Link
                          href={`/admissions/${item.id}`}
                          className="table-link font-semibold text-primary"
                          onClick={(e) => e.stopPropagation()}
                          data-testid={`admission-link-${item.id}`}
                        >
                          {item.admissionNumber}
                        </Link>
                      </td>
                      <td>
                        <strong>{item.studentName}</strong>
                      </td>
                      <td>{item.program?.name || "—"}</td>
                      <td>{classSection}</td>
                      <td>{date(item.confirmedAt || item.createdAt)}</td>
                      <td>
                        <Status>Confirmed</Status>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Table Footer with Pagination */}
          <div className="table-foot" data-testid="dashboard-pagination-bar">
            <span>
              Showing {startRecord} to {endRecord} of {total} admissions
            </span>

            <div className="inline-flex items-center gap-3">
              <button
                type="button"
                data-testid="pagination-prev"
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={page <= 1 || dashboardQuery.isFetching}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Previous page"
              >
                <ArrowLeft size={13} />
                <span>Previous</span>
              </button>

              <span className="text-xs font-medium" data-testid="pagination-page-indicator">
                Page {page} of {Math.max(totalPages, 1)}
              </span>

              <button
                type="button"
                data-testid="pagination-next"
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                disabled={page >= totalPages || dashboardQuery.isFetching}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Next page"
              >
                <span>Next</span>
                <ArrowRight size={13} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
