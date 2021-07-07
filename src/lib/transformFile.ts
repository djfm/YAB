import babelParser from '@babel/parser';

import addJsExtension from './appendJsExtension';
import { Transformation } from './transformation';

export type SourceInfo = {
  filePath: string
}

export type FileMetaData = {
  pathname: string,
  sourceMappingURL?: string
}

export const transformFile = async (
  sourceCode: string,
  sourceFileMetaData: FileMetaData,
): Promise<[Transformation[], FileMetaData]> => {
  const AST = babelParser.parse(sourceCode, {
    sourceType: 'module',
    plugins: [
      'jsx',
      'typescript',
    ],
  });

  if (AST.type !== 'File') {
    fail(AST);
  }

  const { program } = AST;

  if (program.type !== 'Program') {
    fail(program);
  }

  const { body: statements } = program;

  return addJsExtension(statements, sourceFileMetaData);
};

export default transformFile;
