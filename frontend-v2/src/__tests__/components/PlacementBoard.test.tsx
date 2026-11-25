import React from "react";
import "@testing-library/jest-dom";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  within,
  act,
} from "@testing-library/react";
import { PlacementBoard } from "@/components/placements/PlacementBoard";
import { placementsAPI } from "@/config/api";
import { useAuth } from "@/context/AuthContext";

jest.mock("@/config/api", () => ({
  placementsAPI: {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    upload: jest.fn(),
    download: jest.fn(),
    removeDocument: jest.fn(),
  },
}));
jest.mock("@/context/AuthContext", () => ({ useAuth: jest.fn() }));
const entry = {
  id: "company-1",
  companyName: "Acme Technologies",
  companyProfile: "Engineering tools for businesses.",
  package: "₹8–12 LPA",
  jobTitle: "Software Engineer",
  visitDate: null,
  status: "published",
  createdAt: "2026-11-25T00:00:00Z",
  updatedAt: "2026-11-25T00:00:00Z",
  documents: [
    { id: "pdf-1", name: "Role.pdf", size: 1024, category: "job-description" },
    {
      id: "pdf-2",
      name: "Interview.pdf",
      size: 2048,
      category: "learning-resource",
    },
  ],
  learningResources: [
    { title: "Preparation guide", url: "https://example.com/prepare" },
  ],
};
beforeEach(() => {
  jest.clearAllMocks();
  (useAuth as jest.Mock).mockReturnValue({
    user: { id: "student" },
    loading: false,
  });
  (placementsAPI.list as jest.Mock).mockResolvedValue({
    data: { placements: [entry] },
  });
});
afterEach(cleanup);
it("keeps company cards compact and opens all PDFs and preparation links in the detail view", async () => {
  render(<PlacementBoard />);
  expect(
    await screen.findByRole("heading", { name: "Acme Technologies" }),
  ).toBeInTheDocument();
  expect(screen.getByText("₹8–12 LPA")).toBeInTheDocument();
  expect(screen.queryByTitle("Download Role.pdf")).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "Open placement: Acme Technologies" }),
  );
  expect(
    screen.getByRole("dialog", { name: "Acme Technologies placement details" }),
  ).toBeInTheDocument();
  expect(screen.getByTitle("Download Role.pdf")).toBeInTheDocument();
  expect(screen.getByTitle("Download Interview.pdf")).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Preparation guide" }),
  ).toHaveAttribute("href", "https://example.com/prepare");
  expect(
    screen.queryByRole("button", { name: "Edit" }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "Close placement details" }),
  );
  fireEvent.change(screen.getByLabelText("Search placements"), {
    target: { value: "missing company" },
  });
  expect(
    screen.getByRole("heading", { name: "No matching companies." }),
  ).toBeInTheDocument();
});
it("saves metadata as a draft, uploads multiple PDFs, then publishes the complete entry", async () => {
  (useAuth as jest.Mock).mockReturnValue({
    user: { id: "admin", isAdmin: true },
    loading: false,
  });
  (placementsAPI.create as jest.Mock).mockResolvedValue({
    data: { placement: { ...entry, status: "draft", documents: [] } },
  });
  (placementsAPI.upload as jest.Mock).mockResolvedValue({
    data: { placement: { ...entry, status: "draft" } },
  });
  (placementsAPI.update as jest.Mock).mockResolvedValue({
    data: { placement: entry },
  });
  render(<PlacementBoard manage />);
  await screen.findByRole("heading", { name: "Acme Technologies" });
  fireEvent.click(screen.getByRole("button", { name: "Add company" }));
  fireEvent.change(screen.getByPlaceholderText("e.g. Acme Technologies"), {
    target: { value: entry.companyName },
  });
  fireEvent.change(screen.getByPlaceholderText("e.g. ₹8–12 LPA · full-time"), {
    target: { value: entry.package },
  });
  fireEvent.change(
    screen.getByPlaceholderText(
      "What the company does, the opportunity, and what students should know.",
    ),
    { target: { value: entry.companyProfile } },
  );
  const files = [
    new File(["%PDF-1.4 role"], "Role.pdf", { type: "application/pdf" }),
    new File(["%PDF-1.4 prep"], "Prep.pdf", { type: "application/pdf" }),
  ];
  fireEvent.change(screen.getByLabelText("Job descriptions"), {
    target: { files },
  });
  fireEvent.change(screen.getByRole("combobox", { name: "Visibility" }), {
    target: { value: "published" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save placement" }));
  await waitFor(() =>
    expect(placementsAPI.update).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({ status: "published" }),
    ),
  );
  expect(placementsAPI.create).toHaveBeenCalledWith(
    expect.objectContaining({ status: "draft" }),
  );
  expect(placementsAPI.upload).toHaveBeenCalledWith(
    "company-1",
    "job-description",
    files,
  );
  expect(
    (placementsAPI.upload as jest.Mock).mock.invocationCallOrder[0],
  ).toBeLessThan(
    (placementsAPI.update as jest.Mock).mock.invocationCallOrder[0],
  );
  expect(
    await screen.findByText("Placement published. Students can now see it."),
  ).toBeInTheDocument();
});

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  URL.createObjectURL = jest.fn(() => "blob:placement-preview");
  URL.revokeObjectURL = jest.fn();
});
it("previews an authenticated PDF inline and releases its URL when closed", async () => {
  (placementsAPI.download as jest.Mock).mockResolvedValue({
    data: new Blob(["%PDF-1.4"], { type: "application/pdf" }),
  });
  render(<PlacementBoard />);
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Open placement: Acme Technologies",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Preview Role.pdf" }));
  const frame = await screen.findByTitle("Preview of Role.pdf");
  expect(frame).toHaveAttribute("src", "blob:placement-preview");
  expect(placementsAPI.download).toHaveBeenCalledWith("company-1", "pdf-1");
  expect(
    screen.getByRole("dialog", { name: "PDF preview: Role.pdf" }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Close PDF preview" }));
  expect(
    screen.queryByRole("dialog", { name: "PDF preview: Role.pdf" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("dialog", { name: "Acme Technologies placement details" }),
  ).toBeInTheDocument();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:placement-preview");
});
it("keeps an upload error inside the preview and lets the user retry", async () => {
  (placementsAPI.download as jest.Mock)
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({ data: new Blob(["%PDF-1.4"]) });
  render(<PlacementBoard />);
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Open placement: Acme Technologies",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Preview Role.pdf" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "This PDF could not be opened.",
  );
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByTitle("Preview of Role.pdf")).toBeInTheDocument();
});
it("shows uploaded PDFs inside their edit groups and updates them after removal without saving the form", async () => {
  (useAuth as jest.Mock).mockReturnValue({
    user: { id: "admin", isAdmin: true },
    loading: false,
  });
  (placementsAPI.removeDocument as jest.Mock).mockResolvedValue({
    data: { placement: { ...entry, documents: [entry.documents[1]] } },
  });
  render(<PlacementBoard manage />);
  fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
  const group = screen.getByRole("region", {
    name: "Job descriptions uploads",
  });
  expect(within(group).getByText("Role.pdf")).toBeInTheDocument();
  expect(
    within(group).getByRole("button", { name: "Preview Role.pdf" }),
  ).toBeInTheDocument();
  expect(
    within(
      screen.getByRole("region", { name: "Learning resources uploads" }),
    ).getByText("Interview.pdf"),
  ).toBeInTheDocument();
  fireEvent.click(
    within(group).getByRole("button", { name: "Remove Role.pdf" }),
  );
  await waitFor(() =>
    expect(within(group).queryByText("Role.pdf")).not.toBeInTheDocument(),
  );
  expect(
    within(group).getByText("No PDFs uploaded in this group."),
  ).toBeInTheDocument();
  expect(placementsAPI.create).not.toHaveBeenCalled();
  expect(placementsAPI.update).not.toHaveBeenCalled();
});
it("ignores a pending preview response after the user closes the dialog", async () => {
  let resolve!: (value: { data: Blob }) => void;
  (placementsAPI.download as jest.Mock).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  render(<PlacementBoard />);
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Open placement: Acme Technologies",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Preview Role.pdf" }));
  fireEvent.click(screen.getByRole("button", { name: "Close PDF preview" }));
  await act(async () => resolve({ data: new Blob(["%PDF-1.4"]) }));
  expect(
    screen.queryByRole("dialog", { name: "PDF preview: Role.pdf" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("dialog", { name: "Acme Technologies placement details" }),
  ).toBeInTheDocument();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it("shows a complete long profile and long document names in the spacious detail view", async () => {
  const profile =
    "Full company profile. ".repeat(40) + "Final eligibility requirement.";
  const name =
    "Complete job description and preparation guide with eligibility requirements.pdf";
  (placementsAPI.list as jest.Mock).mockResolvedValue({
    data: {
      placements: [
        {
          ...entry,
          companyProfile: profile,
          documents: [{ ...entry.documents[0], name }],
        },
      ],
    },
  });
  render(<PlacementBoard />);
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Open placement: Acme Technologies",
    }),
  );
  const details = screen.getByRole("dialog", {
    name: "Acme Technologies placement details",
  });
  expect(within(details).getByText(profile)).toBeInTheDocument();
  expect(within(details).getByText(name)).toBeInTheDocument();
  fireEvent.click(
    within(details).getByRole("button", { name: "← Back to placements" }),
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Open placement: Acme Technologies" }),
  ).toBeInTheDocument();
});

const logoImage =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lsEAAAAASUVORK5CYII=";
it("shows the saved company logo instead of initials and preserves it when editing", async () => {
  (useAuth as jest.Mock).mockReturnValue({
    user: { id: "admin", isAdmin: true },
    loading: false,
  });
  (placementsAPI.list as jest.Mock).mockResolvedValue({
    data: { placements: [{ ...entry, logoImage }] },
  });
  render(<PlacementBoard manage />);
  expect(
    await screen.findByRole("img", { name: "Acme Technologies logo" }),
  ).toHaveAttribute("src", logoImage);
  expect(
    screen.queryByLabelText("Acme Technologies initials"),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  const editor = screen.getByRole("region", { name: "Placement editor" });
  expect(
    within(editor).getByRole("img", { name: "Acme Technologies logo" }),
  ).toBeInTheDocument();
  fireEvent.click(within(editor).getByRole("button", { name: "Remove logo" }));
  expect(within(editor).queryByRole("img")).not.toBeInTheDocument();
  expect(
    within(editor).getByLabelText("Acme Technologies initials"),
  ).toBeInTheDocument();
});
it("resizes a selected logo and includes it in the saved placement", async () => {
  (useAuth as jest.Mock).mockReturnValue({
    user: { id: "admin", isAdmin: true },
    loading: false,
  });
  (placementsAPI.update as jest.Mock).mockResolvedValue({
    data: { placement: { ...entry, logoImage } },
  });
  globalThis.createImageBitmap = jest
    .fn()
    .mockResolvedValue({ width: 640, height: 320, close: jest.fn() });
  const context = jest
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue({
      drawImage: jest.fn(),
    } as unknown as CanvasRenderingContext2D);
  const encode = jest
    .spyOn(HTMLCanvasElement.prototype, "toDataURL")
    .mockReturnValue(logoImage);
  try {
    render(<PlacementBoard manage />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText(/Company logo/), {
      target: {
        files: [new File(["logo"], "logo.png", { type: "image/png" })],
      },
    });
    await waitFor(() =>
      expect(
        within(
          screen.getByRole("region", { name: "Placement editor" }),
        ).getByRole("img", { name: "Acme Technologies logo" }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save placement" }));
    await waitFor(() =>
      expect(placementsAPI.update).toHaveBeenCalledWith(
        "company-1",
        expect.objectContaining({ logoImage }),
      ),
    );
    expect(encode).toHaveBeenCalledWith("image/webp", 0.85);
  } finally {
    context.mockRestore();
    encode.mockRestore();
  }
});
