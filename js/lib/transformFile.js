import babelParser from '@babel/parser';
import addJsExtension from './appendJsExtension';
export const transformFile = async (sourceCode, sourceFileMetaData) => {
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
//# sourceMappingURL=transformFile.js.map