/**
 * This looks ugly, I know, but, for some reason,
 * "import traverse from 'traverse'" does not import
 * the default export, and it doesn't even import an
 * object whose default property I can access, so
 * this is the only way I found to import traverse.
 *
 * There is either a type mismatch between the code
 * in @babel/traverse and the @babel/types declarations
 * or something fishy going on with the
 * esModuleInterop setting or something...
 *
 * I've isolated this workaround in its own file
 * and hope to be able to remove it some day.
 */

import wrongTraverse, * as traverseMess from '@babel/traverse';

// @ts-ignore
export const traverse: typeof wrongTraverse = traverseMess.default.default;

export default traverse;
