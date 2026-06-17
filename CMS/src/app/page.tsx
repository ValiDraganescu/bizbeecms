import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";

export default async function Home() {
  const t = await getTranslations("home");
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.75rem",
        padding: "2rem",
        textAlign: "center",
      }}
    >
      <div style={{ position: "absolute", top: "1rem", right: "1rem" }}>
        <LocaleSwitcher />
      </div>
      <h1 style={{ fontSize: "2rem", margin: 0 }}>{t("title")}</h1>
      <p style={{ color: "#666", maxWidth: "32rem" }}>{t("intro")}</p>
      <p style={{ color: "#999", fontSize: "0.85rem" }}>{t("stack")}</p>
    </main>
  );
}
