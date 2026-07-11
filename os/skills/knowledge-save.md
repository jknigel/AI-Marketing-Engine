---
name: kb-save
description: Save a durable fact or learning into the knowledge base and update INDEX.md atomically
profiles: all
---

# Skill: /kb-save — add or update a knowledge base document

Input: the knowledge itself (a fact, learning, case study, competitor note) and,
optionally, an existing doc path to update.

1. Check `workspace/knowledge/INDEX.md` — does a document already cover this topic?
   Update that file instead of creating a near-duplicate.
2. Pick the folder by content type: `product/`, `customers/`, `market/`, `playbook/`,
   `org/` (see `contracts/knowledge-base.md`). Filename: short-kebab-case topic.
3. Write the document: title, the distilled knowledge (facts and conclusions, not raw
   dumps), and a `## Sources` section with URLs/artifact paths it was distilled from.
4. Update `INDEX.md` in the same run: add or refresh the row (path, one-line "Answers"
   snippet written like a search result, owner = your profile id, today's date), and
   keep the table sorted newest-updated first.
5. Never leave an orphan: a doc without an INDEX.md row, or a row without a doc, is a
   contract violation — fix it before finishing the task.
