import { uploadContacts } from "@/app/actions";
import { ActionForm } from "@/app/ui/action-form";
import { requireAdmin } from "@/lib/auth";

export default async function UploadContactsPage() {
  await requireAdmin();
  return (
    <>
      <h1>Upload Company Contacts export</h1>
      <p>
        The file replaces all contacts. It needs DBA Name and City (or Ship City) columns; other columns are ignored.
        Customer names that match a DBA Name become accounts with that city.
      </p>
      <ActionForm action={uploadContacts} submitLabel="Upload">
        <input name="file" type="file" accept=".csv,text/csv" required />
      </ActionForm>
    </>
  );
}
