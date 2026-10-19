import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { schemaTypes, singletonTypes } from "./schemaTypes";

export default defineConfig({
  name: "default",
  title: "simple-shop",
  projectId: "elq0qoon",
  dataset: "production",
  plugins: [
    structureTool({
      structure: (S) =>
        S.list()
          .title("Content")
          .items([
            // Singletons open their one document directly, with a fixed ID.
            S.listItem()
              .title("Home page")
              .id("homePage")
              .child(S.document().schemaType("homePage").documentId("homePage")),
            ...S.documentTypeListItems().filter(
              (item) => !singletonTypes.has(item.getId() ?? ""),
            ),
          ]),
    }),
  ],
  schema: {
    types: schemaTypes,
    // Hide singletons from the "Create new document" menu.
    templates: (templates) =>
      templates.filter(({ schemaType }) => !singletonTypes.has(schemaType)),
  },
  document: {
    // Singletons can't be duplicated or deleted.
    actions: (actions, { schemaType }) =>
      singletonTypes.has(schemaType)
        ? actions.filter(
            ({ action }) => action && ["publish", "discardChanges", "restore"].includes(action),
          )
        : actions,
  },
});
