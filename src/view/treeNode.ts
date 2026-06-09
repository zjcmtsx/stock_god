export type TreeNode =
  | { kind: 'group'; id: string }
  | { kind: 'stock'; code: string; groupId: string };

export function isGroupNode(n: TreeNode): n is { kind: 'group'; id: string } {
  return n.kind === 'group';
}

export function isStockNode(n: TreeNode): n is { kind: 'stock'; code: string; groupId: string } {
  return n.kind === 'stock';
}

export function nodeKey(n: TreeNode): string {
  return n.kind === 'group' ? `g:${n.id}` : `s:${n.groupId}:${n.code}`;
}
