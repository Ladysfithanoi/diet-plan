import LoginForm from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ kicked?: string; expired?: string }>;
}) {
  const params = await searchParams;
  return <LoginForm kicked={params.kicked === "1"} expired={params.expired === "1"} />;
}
