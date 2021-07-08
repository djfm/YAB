import babelParser from '@babel/parser';

import appendJsExtension from './appendJsExtension';
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
  const ast = babelParser.parse(sourceCode, {
    sourceType: 'module',
    plugins: [
      'jsx',
      'typescript',
    ],
  });

  return appendJsExtension(ast, sourceFileMetaData);
};

export default transformFile;
