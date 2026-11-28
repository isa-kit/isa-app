// Input schemas for the `files` MCP server tools, built from a zod instance
// passed in (the sidecar's real zod; tests use real zod too). Kept in its own
// module so a test can validate sample inputs against the REAL schemas.
//
// The host (lib/src/chat_agent/files/file_ops.dart) does the authoritative
// validation; these schemas only have to let every legal op through, so each
// op declares exactly the fields it takes (move has from/to, copy_in has
// to/from?, and so on) and stays loose about the rest.
export function buildFileToolShapes(z) {
  const overwrite = z.boolean().optional();
  const op = (name, fields) => z.looseObject({ op: z.literal(name), ...fields });
  const opSchema = z.discriminatedUnion('op', [
    op('mkdir', { path: z.string() }),
    op('move', { from: z.string(), to: z.string(), overwrite }),
    op('write_text', { path: z.string(), text: z.string(), overwrite }),
    op('copy_in', { to: z.string(), from: z.string().optional(), overwrite }),
    op('trash', { path: z.string() }),
    op('write_docx', { path: z.string(), doc: z.any(), overwrite }),
    op('write_pdf', { path: z.string(), doc: z.any(), overwrite }),
    op('write_xlsx', { path: z.string(), sheets: z.any(), overwrite }),
  ]);
  return {
    read_document: {
      path: z.string(),
      sheet: z.string().optional(),
      start_row: z.number().int().min(1).optional(),
      max_rows: z.number().int().min(1).max(2000).optional(),
      offset: z.number().int().min(0).optional(),
    },
    list_dir: { path: z.string() },
    search: { query: z.string(), source: z.string() },
    // Output (host-built): status, reason, fields, plus description (plain text, <= 20000 chars),
    // pay and location for Greenhouse/Lever/Ashby; description null + description_note elsewhere.
    check_job: { url: z.string() },
    apply_changes: { ops: z.array(opSchema) },
  };
}
