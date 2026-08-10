import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Parsers that must not be bundled into the server build.
   *
   * Both are pure JavaScript and dependency-free, so this is not the usual
   * native-binary reason. It is that `unpdf` loads PDF.js through its own
   * resolution, and bundling it produced a build that **parsed nothing and
   * said nothing**: `extractText` returned a document with no text rather than
   * throwing, so every PDF uploaded cleanly, stored correctly, and indexed
   * zero words. The same call against the same file in plain Node returned the
   * text immediately, which is what pinned it on bundling rather than on the
   * library.
   *
   * That failure shape is the argument for this being here rather than a
   * comment somewhere: it is silent on both sides. Nothing errors, nothing
   * warns, and the only symptom is Craig eventually saying he cannot find
   * anything in a handbook that is sitting right there.
   */
  serverExternalPackages: ["unpdf", "@zip.js/zip.js"],
};

export default nextConfig;
