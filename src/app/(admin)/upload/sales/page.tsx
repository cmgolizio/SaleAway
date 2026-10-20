import { uploadSales } from "@/app/actions";
import { ActionForm } from "@/app/ui/action-form";
import { requireAdmin } from "@/lib/auth";
import { SALES_HEADERS } from "@/lib/csv";

export default async function UploadSalesPage() {
  await requireAdmin();
  return (
    <>
      <h1>Upload sales export</h1>
      <p>
        Every sales row between the file&apos;s first and last Invoice Date is replaced by the file, in one step. Uploading
        the same file twice changes nothing. Any date range works; pull overlapping ranges freely.
      </p>
      <p className="muted">Expected headers, in order: {SALES_HEADERS.join(", ")}</p>
      <ActionForm action={uploadSales} submitLabel="Upload">
        <input name="file" type="file" accept=".csv,text/csv" required />
      </ActionForm>
    </>
  );
}
