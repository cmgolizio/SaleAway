import { login } from "@/app/actions";
import { ActionForm } from "@/app/ui/action-form";

export default function LoginPage() {
  return (
    <main>
      <h1>Account Growth Engine</h1>
      <ActionForm action={login} submitLabel="Log in" className="stack">
        <label>
          Email <input name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          Password <input name="password" type="password" autoComplete="current-password" required />
        </label>
      </ActionForm>
    </main>
  );
}
