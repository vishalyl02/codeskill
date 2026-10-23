import { ErrorFallback } from "@/components/errors/ErrorFallback";

export default function NotFound() {
  return <ErrorFallback statusCode={404} reloadOnRetry />;
}
