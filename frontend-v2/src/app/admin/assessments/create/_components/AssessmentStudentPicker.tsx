"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { Download, Search, Upload, UserCheck, X } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { adminAssessmentsAPI, type AssessmentTargetStudent, type AssessmentUidMatches } from "@/config/api";

interface Props {
  selectedIds: string[];
  selectedStudents: AssessmentTargetStudent[];
  onAdd: (students: AssessmentTargetStudent[]) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}

export default function AssessmentStudentPicker({ selectedIds, selectedStudents, onAdd, onRemove, onClear }: Props) {
  const [input, setInput] = useState("");
  const [lookup, setLookup] = useState<{ query: string; students: AssessmentTargetStudent[]; failed?: boolean } | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [review, setReview] = useState<AssessmentUidMatches | null>(null);
  const [bulkAdded, setBulkAdded] = useState<number | null>(null);
  const query = input.trim();
  const currentLookup = lookup?.query === query ? lookup : null;
  const selected = new Set(selectedIds);
  const isAssigned = (student: AssessmentTargetStudent) => selected.has(student.id) || Boolean(student.uid && selected.has(student.uid));
  const newStudents = review?.students.filter((student) => !isAssigned(student)) ?? [];
  const studentByKey = new Map<string, AssessmentTargetStudent>();
  for (const student of selectedStudents) {
    studentByKey.set(student.id, student);
    if (student.uid) studentByKey.set(student.uid, student);
  }

  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const { data } = await adminAssessmentsAPI.searchStudents({ search: query, limit: 20 }, controller.signal);
        const students = data && "data" in data ? data.data?.students : data?.students;
        if (!Array.isArray(students)) throw new Error("Invalid student search response");
        if (!controller.signal.aborted) setLookup({ query, students });
      } catch {
        if (!controller.signal.aborted) setLookup({ query, students: [], failed: true });
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, retryCount]);

  const uploadUids = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setUploading(true);
    setReview(null);
    setUploadError("");
    setBulkAdded(null);
    try {
      const { data } = await adminAssessmentsAPI.resolveStudentUids(file);
      setReview(data);
    } catch (error) {
      const message = (error as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
      setUploadError(typeof message === "string" ? message : "Couldn’t check the UID file. Try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="md:col-span-4 space-y-3 rounded-xl border border-border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <label htmlFor="student-search-input" className="flex items-center gap-1.5 text-xs font-bold text-foreground">
            <Search aria-hidden="true" className="size-3.5 text-primary" />
            Assign Specific Students (Irrespective of Semesters)
          </label>
          <p className="mt-0.5 text-xs text-muted-foreground">Add registered students from any semester or section.</p>
        </div>
        {selectedIds.length > 0 && (
          <button type="button" onClick={onClear} className="text-xs font-semibold text-destructive hover:underline">
            Clear assigned ({selectedIds.length})
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            id="student-search-input"
            type="search"
            value={input}
            onChange={(event) => {
              if (event.target.value.trim() !== query) setLookup(null);
              setInput(event.target.value);
            }}
            placeholder="Search by name, UID, or email"
            autoComplete="off"
            className="w-full rounded-xl border border-border bg-muted/30 py-2 pl-9 pr-10 text-sm focus:ring-1 focus:ring-primary"
          />
          {query && !currentLookup && <Spinner className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-primary" />}
        </div>
        {query && !currentLookup && <p role="status" className="sr-only">Searching for students</p>}
        {currentLookup?.failed && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2">
            <p role="alert" className="text-xs text-destructive">Couldn’t reach the student directory. Try again to check this search.</p>
            <button type="button" className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-semibold hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary" onClick={() => {
              setLookup(null);
              setRetryCount((count) => count + 1);
            }}>Retry search</button>
          </div>
        )}
        {currentLookup && !currentLookup.failed && currentLookup.students.length === 0 && (
          <p role="status" className="text-xs text-muted-foreground">No active students match your search.</p>
        )}
        {!!currentLookup?.students.length && (
          <ul aria-label="Matching students" className="max-h-52 space-y-1 overflow-y-auto rounded-xl border border-border bg-card p-1">
            {currentLookup.students.map((student) => {
              const assigned = isAssigned(student);
              return (
                <li key={student.id}>
                  <button
                    type="button"
                    disabled={assigned}
                    onClick={() => onAdd([student])}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-xs hover:bg-muted disabled:bg-primary/10"
                  >
                    <span className="min-w-0">
                      <span className="font-semibold text-foreground">{student.name}</span>
                      <span className="block break-words text-muted-foreground">{[student.uid, student.email].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="shrink-0 rounded-md border border-border bg-background px-2 py-1 font-medium text-primary">{assigned ? "Assigned" : "Add"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-semibold text-foreground">Bulk add by UID</h3>
            <p id="student-uid-upload-help" className="text-xs text-muted-foreground">Upload an Excel or CSV file with one UID column.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href="/templates/assessment-student-uids.xlsx" download className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-muted">
              <Download aria-hidden="true" className="size-3.5" /> Sample Excel
            </a>
            <label className={`relative inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 ${uploading ? "opacity-60" : "cursor-pointer hover:bg-primary/90"}`}>
              <input type="file" aria-label="Upload UID file" aria-describedby="student-uid-upload-help" className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-wait" accept=".xlsx,.csv" disabled={uploading} onChange={uploadUids} />
              <Upload aria-hidden="true" className="size-3.5" /> {uploading ? "Checking UIDs…" : "Upload UID file"}
            </label>
          </div>
        </div>
        {uploadError && <p role="alert" className="text-xs text-destructive">{uploadError}</p>}
        {bulkAdded !== null && <p role="status" className="text-xs text-primary">{bulkAdded} {bulkAdded === 1 ? "student" : "students"} added to the assignment list.</p>}
        {review && (
          <div className="space-y-2 rounded-lg border border-border bg-card p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p role="status" className="font-medium text-foreground">
                {review.students.length} matched · {review.students.length - newStudents.length} already assigned · {review.duplicateCount} duplicate rows
              </p>
              {newStudents.length > 0 && <button type="button" onClick={() => {
                onAdd(newStudents);
                setBulkAdded(newStudents.length);
              }} className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 font-semibold text-primary hover:bg-primary/20">
                Add {newStudents.length} {newStudents.length === 1 ? "student" : "students"}
              </button>}
            </div>
            {review.students.length > 0 && <details>
              <summary className="cursor-pointer text-muted-foreground">Review matched students</summary>
              <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto pl-4">
                {review.students.map((student) => <li key={student.id}>{student.name} ({student.uid})</li>)}
              </ul>
            </details>}
            {review.missingUids.length > 0 && <p className="max-h-24 overflow-y-auto break-words text-amber-700 dark:text-amber-300">No active match ({review.missingUids.length}) · {review.missingUids.join(", ")}</p>}
            {review.ambiguousUids.length > 0 && <p className="max-h-24 overflow-y-auto break-words text-amber-700 dark:text-amber-300">Multiple accounts match ({review.ambiguousUids.length}) · {review.ambiguousUids.join(", ")}</p>}
          </div>
        )}
      </div>

      {selectedIds.length > 0 && (
        <ul aria-label="Assigned students" className="flex max-h-40 flex-wrap items-start gap-1.5 overflow-y-auto pt-1">
          {selectedIds.map((id) => {
            const student = studentByKey.get(id);
            const name = student ? `${student.name} (${student.uid || student.email})` : `Student (${id})`;
            return (
              <li key={id} className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-foreground">
                <UserCheck aria-hidden="true" className="size-3 shrink-0 text-primary" />
                <span className="break-all">{name}</span>
                <button type="button" onClick={() => onRemove(id)} aria-label={`Remove ${name}`} className="rounded p-0.5 hover:text-destructive">
                  <X aria-hidden="true" className="size-3" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
