import { defineField, defineType } from "sanity";

export const homePage = defineType({
  name: "homePage",
  title: "Home page",
  type: "document",
  fields: [
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "paragraph",
      title: "Paragraph",
      type: "text",
      rows: 4,
      validation: (rule) => rule.required(),
    }),
  ],
});
