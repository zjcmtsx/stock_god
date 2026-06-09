import * as vscode from 'vscode';
import { WatchListStore } from '../store/watchListStore';
import { TreeNode, isGroupNode, isStockNode } from './treeNode';

const MIME = 'application/vnd.code.tree.mygodstockwatchlist';

interface DragPayload {
  kind: 'stock' | 'group';
  ids: string[];
}

export class StockDragAndDropController implements vscode.TreeDragAndDropController<TreeNode> {
  readonly dragMimeTypes = [MIME];
  readonly dropMimeTypes = [MIME];

  constructor(private readonly store: WatchListStore) {}

  handleDrag(
    source: readonly TreeNode[],
    dataTransfer: vscode.DataTransfer
  ): void {
    if (source.length === 0) return;
    const first = source[0];
    let payload: DragPayload;
    if (isGroupNode(first)) {
      payload = { kind: 'group', ids: [first.id] };
    } else {
      const codes: string[] = [];
      for (const n of source) {
        if (isStockNode(n)) codes.push(n.code);
      }
      if (codes.length === 0) return;
      payload = { kind: 'stock', ids: codes };
    }
    dataTransfer.set(MIME, new vscode.DataTransferItem(JSON.stringify(payload)));
  }

  async handleDrop(
    target: TreeNode | undefined,
    dataTransfer: vscode.DataTransfer
  ): Promise<void> {
    const item = dataTransfer.get(MIME);
    if (!item) return;
    let payload: DragPayload;
    try {
      payload = JSON.parse(await item.asString());
    } catch {
      return;
    }
    if (!payload || !Array.isArray(payload.ids) || payload.ids.length === 0) return;

    if (payload.kind === 'group') {
      await this.handleDropGroup(payload.ids[0], target);
      return;
    }
    await this.handleDropStocks(payload.ids, target);
  }

  private async handleDropGroup(srcId: string, target: TreeNode | undefined): Promise<void> {
    if (!target) return;
    if (isStockNode(target)) {
      const targetGroup = this.store.findGroup(target.groupId);
      if (!targetGroup) return;
      if (targetGroup.id === srcId) return;
      await this.store.reorderGroups(srcId, targetGroup.order);
      return;
    }
    if (isGroupNode(target)) {
      if (target.id === srcId) return;
      const targetGroup = this.store.findGroup(target.id);
      if (!targetGroup) return;
      await this.store.reorderGroups(srcId, targetGroup.order);
    }
  }

  private async handleDropStocks(codes: string[], target: TreeNode | undefined): Promise<void> {
    if (!target) {
      await this.store.moveStocks(codes, 'default');
      return;
    }
    if (isGroupNode(target)) {
      await this.store.moveStocks(codes, target.id);
      return;
    }
    if (isStockNode(target)) {
      if (codes.includes(target.code)) return;
      await this.store.moveStocks(codes, target.groupId, target.code);
    }
  }
}
