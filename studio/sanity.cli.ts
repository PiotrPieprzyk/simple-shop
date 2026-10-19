import {defineCliConfig} from "sanity/cli";

export default defineCliConfig({
    api: {
        projectId: "elq0qoon",
        dataset: "production",
    },
    // Hosted Studio at https://piotrpieprzyk-shop.sanity.studio
    deployment: {
        appId: 'g2c588akrbvk98ivduyj4w5u',
    },
    typegen: {
        path: "../web/{app,lib}/**/*.{ts,tsx}",
        schema: "schema.json",
        generates: "../web/sanity.types.ts",
        overloadClientMethods: true,
    },
});
