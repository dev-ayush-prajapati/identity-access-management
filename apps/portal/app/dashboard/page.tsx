import { SignOutForm } from "@/components/auth/sign-out-form";

export default function DashboardPage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-8">
      <div className="flex justify-end">
        <SignOutForm />
      </div>
      <p>Employee dashboard zone (placeholder — real dashboard built in step 6)</p>
    </div>
  );
}
