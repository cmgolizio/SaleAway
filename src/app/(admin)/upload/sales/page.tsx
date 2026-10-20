import { uploadSales } from "@/app/actions";
import { ActionForm } from "@/app/ui/action-form";
import { requireAdmin } from "@/lib/auth";
import { SALES_HEADERS } from "@/lib/csv";

export default async function UploadSalesPage() {
  await requireAdmin();
  return (
    <>
      <h1>Upload sales or samples export</h1>
      <p>
        A file replaces every row of its own kind between its first and last Invoice Date, in one step: a sales export
        replaces sales and credits, a samples export replaces samples. Uploading the same file twice changes nothing.
        Any date range works; pull overlapping ranges freely.
      </p>
      <p className="muted">Expected headers, in order: {SALES_HEADERS.join(", ")}</p>
      <ActionForm action={uploadSales} submitLabel="Upload">
        <input name="file" type="file" accept=".csv,text/csv" required />
      </ActionForm>
    </>
  );
}
