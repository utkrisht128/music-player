import React from "react";
import { useNavigate } from "react-router-dom";
import EmptyState from "../components/EmptyState";
import { useSeo } from "../hooks/useSeo";

export default function NotFound() {
  useSeo({ title: "Page not found", noindex: true });
  const navigate = useNavigate();
  return (
    <div className="page">
      <EmptyState
        icon="warning"
        title="Page not found"
        message="We could not find the page you were looking for."
        action="Back to home"
        onAction={() => navigate("/")}
      />
    </div>
  );
}
