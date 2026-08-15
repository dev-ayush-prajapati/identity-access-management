import { SignOutForm } from "@/components/auth/sign-out-form";

export default function ProfilePage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-8">
      <div className="flex justify-end">
        <SignOutForm />
      </div>
      <p>Profile zone (placeholder — real screen built in step 6)</p>
    </div>
  );
}
