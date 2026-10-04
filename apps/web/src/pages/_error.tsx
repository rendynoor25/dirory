import type { NextPageContext } from "next";

/**
 * The App Router still falls back to this Pages-Router error component for the
 * 404/500 shell. React 19 dropped the legacy element format the built-in one
 * emits, so we provide our own to keep production builds clean.
 */
function ErrorPage({ statusCode }: { statusCode: number }) {
  const title = statusCode === 404 ? "Page not found" : "Something went wrong";
  return (
    <main
      style={{
        display: "flex",
        minHeight: "100vh",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <p style={{ fontWeight: 600, color: "#3440e8" }}>Dirory</p>
        <h1 style={{ fontSize: 24 }}>{title}</h1>
        <p style={{ color: "#475569" }}>
          {statusCode === 404
            ? "The page you are looking for does not exist."
            : "An unexpected error occurred."}
        </p>
        <a href="/" style={{ color: "#3440e8" }}>
          Back home
        </a>
      </div>
    </main>
  );
}

ErrorPage.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode ?? 500 : 404;
  return { statusCode };
};

export default ErrorPage;
