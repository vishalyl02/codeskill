import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import Picker from "@/app/admin/assessments/create/_components/AssessmentStudentPicker";
import { adminAssessmentsAPI, type AssessmentTargetStudent } from "@/config/api";

jest.mock("@/config/api", () => ({ adminAssessmentsAPI: {
  searchStudents: jest.fn(), resolveStudentUids: jest.fn(),
} }));

const student = { id: "student-1", name: "Alice Johnson", email: "alice@example.invalid", uid: "CS001" };

function Form() {
  const [students, setStudents] = useState<AssessmentTargetStudent[]>([]);
  return <Picker
    selectedIds={students.map(({ id }) => id)}
    selectedStudents={students}
    onAdd={(newStudents) => setStudents((current) => [...current, ...newStudents])}
    onClear={() => setStudents([])}
    onRemove={(id) => setStudents((current) => current.filter((entry) => entry.id !== id))}
  />;
}

beforeEach(() => jest.clearAllMocks());

it("shows database search results and lets admins add and remove a student", async () => {
  jest.mocked(adminAssessmentsAPI.searchStudents).mockResolvedValueOnce({ data: { students: [student] } });
  render(<Form />);

  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "  alice@example.invalid " } });
  const result = await screen.findByRole("button", { name: /Alice Johnson.*Add/ });
  expect(adminAssessmentsAPI.searchStudents).toHaveBeenCalledWith({ search: "alice@example.invalid", limit: 20 }, expect.any(AbortSignal));
  fireEvent.click(result);
  expect(result).toBeDisabled();
  const remove = screen.getByRole("button", { name: "Remove Alice Johnson (CS001)" });
  fireEvent.click(remove);
  expect(result).toBeEnabled();
});

it("retries the same UID after a connection error and shows the matched student's name", async () => {
  jest.mocked(adminAssessmentsAPI.searchStudents)
    .mockRejectedValueOnce(new Error("Network Error"))
    .mockResolvedValueOnce({ data: { data: { students: [student] } } });
  render(<Form />);

  fireEvent.change(screen.getByRole("searchbox"), { target: { value: " CS001 " } });
  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t reach the student directory");
  fireEvent.click(screen.getByRole("button", { name: "Retry search" }));
  expect(await screen.findByRole("button", { name: /Alice Johnson.*CS001.*Add/ })).toBeEnabled();
  expect(adminAssessmentsAPI.searchStudents).toHaveBeenCalledTimes(2);
  expect(adminAssessmentsAPI.searchStudents).toHaveBeenLastCalledWith({ search: "CS001", limit: 20 }, expect.any(AbortSignal));
});

it("reviews the UID upload before adding a match and reports omitted rows", async () => {
  jest.mocked(adminAssessmentsAPI.resolveStudentUids).mockResolvedValueOnce({ data: {
    students: [student], missingUids: ["UNKNOWN"], ambiguousUids: [], duplicateCount: 1,
  } });
  render(<Form />);
  const file = new File(["UID\nCS001\nUNKNOWN"], "students.csv", { type: "text/csv" });
  fireEvent.change(screen.getByLabelText("Upload UID file"), { target: { files: [file] } });

  expect(adminAssessmentsAPI.resolveStudentUids).toHaveBeenCalledWith(file);
  const add = await screen.findByRole("button", { name: "Add 1 student" });
  expect(screen.getByText(/No active match.*UNKNOWN/)).toBeInTheDocument();
  expect(screen.getByText(/1 duplicate rows/)).toBeInTheDocument();
  expect(screen.queryByRole("list", { name: "Assigned students" })).not.toBeInTheDocument();

  fireEvent.click(add);
  expect(screen.getByRole("list", { name: "Assigned students" })).toHaveTextContent("Alice Johnson (CS001)");
  expect(screen.queryByRole("button", { name: "Add 1 student" })).not.toBeInTheDocument();
});
