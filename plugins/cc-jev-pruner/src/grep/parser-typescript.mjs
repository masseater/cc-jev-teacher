import { basename } from "node:path";

import { API } from "typescript/async";
import { NodeFlags } from "typescript/ast";
import { isClassDeclaration, isVariableStatement } from "typescript/ast/is";
import { getLeadingCommentRanges, getTrailingCommentRanges } from "typescript/ast/scanner";
import { serverFS } from "typescript/fs";

let tsgo;
let nextFile = 0;
const files = new Map();
const fs = {
  readFile: (name) => files.get(name),
  fileExists: (name) => files.has(name),
  directoryExists: () => true,
  getAccessibleEntries: () => ({ files: [], directories: [], symlinks: undefined }),
  realpath: serverFS.identity,
  stat: serverFS.fakeStat,
  writeFile: serverFS.error,
  removeFile: serverFS.error,
};
const OPTIONS = { allowJs: true, noLib: true, noResolve: true, types: [] };
const UNRESOLVED = { moduleResolutions: { fallback: "unresolved", entries: [] } };

async function start() {
  const api = new API({ fs });
  return { api, moduleResolver: await api.createModuleResolver(OPTIONS, UNRESOLVED) };
}

const CHECKED_OUTSIDE_PARSER = new Set([
  1206, 1486, 8002, 8003, 8004, 8005, 8006, 8008, 8009, 8010, 8011, 8012, 8013, 8016, 8017, 8037,
  8038,
]);

const reparsed = (node) => (node.flags & NodeFlags.Reparsed) !== 0;

function analyze(file, source, diagnostics) {
  const line = (position) => file.getLineAndCharacterOfPosition(position).line + 1;
  const units = [],
    comments = [];
  const add = (node, prefix = "", ownerHeaders = []) => {
    const name =
      prefix +
      (node.name?.getText(file) ||
        (isVariableStatement(node)
          ? node.declarationList.declarations.map((d) => d.name.getText(file)).join(", ")
          : "source"));
    const members = isClassDeclaration(node) ? node.members.filter((m) => !reparsed(m)) : [];
    if (members.length) {
      const start = line(node.getStart(file)),
        first = line(members[0].getStart(file));
      const header = first > start ? { startLine: start, endLine: first - 1 } : undefined;
      const headers = header ? [...ownerHeaders, header] : ownerHeaders;
      if (header) units.push({ name: name + ".context", range: header, ownerHeaders: headers });
      for (const member of members) add(member, name + ".", headers);
    } else
      units.push({
        name,
        ownerHeaders,
        range: {
          startLine: line(node.getStart(file)),
          endLine: line(Math.max(node.getStart(file), node.end - 1)),
        },
      });
  };
  const jsDoc = [];
  const visit = (node) => {
    if (reparsed(node)) return;
    for (const comment of [
      ...(getLeadingCommentRanges(source, node.getFullStart()) ?? []),
      ...(getTrailingCommentRanges(source, node.end) ?? []),
    ]) {
      if (source.startsWith("/**", comment.pos) && !source.startsWith("/**/", comment.pos))
        jsDoc.push(comment);
      comments.push({ startLine: line(comment.pos), endLine: line(comment.end - 1) });
    }
    node.forEachChild(visit);
  };
  visit(file);
  const syntax = diagnostics.some(
    ({ code, pos }) =>
      !CHECKED_OUTSIDE_PARSER.has(code) &&
      !jsDoc.some((comment) => comment.pos <= pos && pos < comment.end),
  );
  if (!syntax) for (const statement of file.statements) if (!reparsed(statement)) add(statement);
  return { units, comments, syntax };
}

export async function typescriptDeclarations({ source, path }) {
  const name = `/inspect/${nextFile++}/${basename(path)}`;
  files.set(name, source.toWellFormed());
  try {
    const { api, moduleResolver } = await (tsgo ??= start());
    const program = await api.createProgram([name], OPTIONS, { moduleResolver });
    try {
      const diagnostics = await program.getSyntacticDiagnostics(name);
      const file = await program.getSourceFile(name);
      if (!file) throw new Error(`tsgo did not parse ${path}`);
      return analyze(file, source, diagnostics);
    } finally {
      await program.dispose();
    }
  } catch (error) {
    tsgo = undefined;
    throw error;
  } finally {
    files.delete(name);
  }
}
