import { useState, useEffect, type FormEvent } from "react";
import { type User, hasPermission, useResource } from "@/lib/mock-erp";
import { Avatar, Loading, PageHeader } from "@/pages/page-primitives";
import {
  useSchoolConfiguration,
  useUpdateSchoolConfiguration,
} from "@/lib/schools-api";
import { useAcademicYears } from "@/lib/academic-years-api";

export function TimetablePage() {
  const query = useResource("timetable");
  if (query.isLoading)
    return (
      <>
        <PageHeader title="Timetable" />
        <Loading />
      </>
    );
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  return (
    <>
      <PageHeader
        title="Timetable"
        description="Published teaching schedule for the current academic year."
      />
      <div className="timetable-scroll">
        <div className="timetable-grid">
          {days.map((day) => (
            <section className="timetable-day" key={day}>
              <div className="timetable-day-head">
                <span>{day.slice(0, 3)}</span>
                <strong>{day}</strong>
              </div>
              {(query.data || [])
                .filter((entry) => entry.day === day)
                .map((entry) => (
                  <div className="timetable-entry" key={entry.id}>
                    <div className="eyebrow">{entry.time}</div>
                    <strong>{entry.subject}</strong>
                    <span>
                      {entry.class} · {entry.section}
                    </span>
                    <small>
                      {entry.faculty} · {entry.room}
                    </small>
                  </div>
                ))}
              {!(query.data || []).some((entry) => entry.day === day) && (
                <div className="timetable-empty">No periods</div>
              )}
            </section>
          ))}
        </div>
      </div>
    </>
  );
}

export function Profile({ session }: { session: User }) {
  const canConfigure = hasPermission(session, "SCHOOL_UPDATE");
  const schoolConfig = useSchoolConfiguration();
  const updateConfig = useUpdateSchoolConfiguration();
  const academicYearsQuery = useAcademicYears();

  const [selectedYearId, setSelectedYearId] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync selectedYearId when schoolConfig loads or changes
  useEffect(() => {
    if (
      schoolConfig.data?.activeAcademicYearId &&
      !schoolConfig.data.isInvalid
    ) {
      setSelectedYearId(schoolConfig.data.activeAcademicYearId);
    }
  }, [schoolConfig.data?.activeAcademicYearId, schoolConfig.data?.isInvalid]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedYearId) {
      setErrorMessage("Please select an academic year.");
      return;
    }
    setErrorMessage(null);
    setSuccessMessage(null);

    updateConfig.mutate(
      { activeAcademicYearId: selectedYearId },
      {
        onSuccess: () => {
          setSuccessMessage(
            "Academic year configuration updated successfully.",
          );
        },
        onError: (err: any) => {
          setErrorMessage(
            err?.message || "Failed to update school configuration.",
          );
        },
      },
    );
  };

  const eligibleYears = (academicYearsQuery.data || []).filter(
    (ay) => ay.isActive !== false,
  );

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="My profile"
        description="Your backend-authenticated identity."
      />
      <div className="profile-layout">
        <section className="panel profile-card">
          <Avatar user={session} size="lg" />
          <div className="eyebrow mt-5">Signed in as</div>
          <h2>{session.name}</h2>
          <p>{session.title}</p>
          <div className="profile-details">
            <div>
              <span>Email</span>
              <strong>{session.email || "Not returned by /auth/me"}</strong>
            </div>
            <div>
              <span>Role</span>
              <strong>{session.role}</strong>
            </div>
            <div>
              <span>School Academic Year</span>
              <strong>
                {schoolConfig.isLoading
                  ? "Loading..."
                  : schoolConfig.isError
                    ? "Unavailable"
                    : schoolConfig.data?.isInvalid
                      ? "Invalid Configuration"
                      : schoolConfig.data?.isConfigured &&
                          schoolConfig.data.activeAcademicYear
                        ? schoolConfig.data.activeAcademicYear.name
                        : "Not Configured"}
              </strong>
            </div>
          </div>
        </section>
        {canConfigure && (
          <section className="panel" data-testid="school-config-panel">
            <div className="panel-head">
              <h3>School Academic Year Configuration</h3>
              <p>
                Configure the operational academic year for all school workflows and dashboards.
              </p>
            </div>

            {schoolConfig.isLoading ? (
              <Loading />
            ) : schoolConfig.isError ? (
              <div className="empty-state" data-testid="config-error-state">
                <p className="text-destructive font-medium">
                  Failed to load school configuration. Please refresh.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSave} className="space-y-4 mt-4">
                {schoolConfig.data?.isInvalid && (
                  <div
                    className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
                    data-testid="config-invalid-alert"
                  >
                    The configured academic year is inactive or soft-deleted.
                    Please select a valid academic year.
                  </div>
                )}

                <div className="form-group">
                  <label
                    htmlFor="academic-year-select"
                    className="form-label block text-sm font-medium mb-1"
                  >
                    Active Academic Year
                  </label>
                  <select
                    id="academic-year-select"
                    data-testid="academic-year-select"
                    className="form-input w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={selectedYearId}
                    onChange={(e) => {
                      setSelectedYearId(e.target.value);
                      setSuccessMessage(null);
                      setErrorMessage(null);
                    }}
                    disabled={updateConfig.isPending}
                  >
                    <option value="">Select an Academic Year...</option>
                    {eligibleYears.map((ay) => (
                      <option key={ay.id} value={ay.id}>
                        {ay.name}
                      </option>
                    ))}
                  </select>
                </div>

                {successMessage && (
                  <div
                    className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-600 font-medium"
                    data-testid="config-save-success"
                  >
                    {successMessage}
                  </div>
                )}

                {errorMessage && (
                  <div
                    className="rounded-md bg-destructive/10 p-3 text-sm text-destructive font-medium"
                    data-testid="config-save-error"
                  >
                    {errorMessage}
                  </div>
                )}

                <div className="pt-2">
                  <button
                    type="submit"
                    data-testid="save-configuration-button"
                    className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    disabled={updateConfig.isPending || !selectedYearId}
                  >
                    {updateConfig.isPending
                      ? "Saving..."
                      : "Save Configuration"}
                  </button>
                </div>
              </form>
            )}
          </section>
        )}
      </div>
    </>
  );
}
