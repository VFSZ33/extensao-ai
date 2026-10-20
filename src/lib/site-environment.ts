export type SiteEnvironment = {
  host: string;
  kind: "production" | "test";
};

export const TEST_SITE_HOST_SUFFIXES = [".preview-v2.autodromo.com.br"];

export function classifySite(pageUrl: string): SiteEnvironment {
  if (!URL.canParse(pageUrl)) {
    return { host: "", kind: "production" };
  }

  const { host, hostname, protocol } = new URL(pageUrl);

  return {
    host,
    kind:
      protocol === "https:" &&
      TEST_SITE_HOST_SUFFIXES.some(
        (suffix) =>
          hostname.endsWith(suffix) && hostname.length > suffix.length,
      )
        ? "test"
        : "production",
  };
}
