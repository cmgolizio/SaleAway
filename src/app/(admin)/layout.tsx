import Link from "next/link";
import type { ReactNode } from "react";
import { logout } from "@/app/actions";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <nav>
        <Link href="/">Status</Link>
        <Link href="/upload/sales">Upload sales</Link>
        <Link href="/upload/contacts">Upload contacts</Link>
        <Link href="/review">Review names</Link>
        <Link href="/regions">Regions</Link>
        <Link href="/accounts">Accounts</Link>
        <form action={logout}>
          <button type="submit">Log out</button>
        </form>
      </nav>
      <main>{children}</main>
    </>
  );
}
