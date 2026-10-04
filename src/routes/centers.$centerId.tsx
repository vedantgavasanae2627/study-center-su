import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/centers/$centerId")({
  component: () => <Outlet />,
});
