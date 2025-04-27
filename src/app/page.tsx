"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2, Edit, FileInput, FileText, Plus } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import * as Papa from 'papaparse';
import { IDBPDatabase, openDB } from 'idb';
import { cn } from "@/lib/utils";

interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  tag?: string;
}

const storeName = 'inventory-store';
const dbName = 'inventory-db';

const getDB = async (): Promise<IDBPDatabase<unknown>> => {
  return openDB(dbName, 1, {
    upgrade(db) {
      db.createObjectStore(storeName, { keyPath: 'id' });
    },
  });
};

const saveInventoryToDB = async (inventory: InventoryItem[]) => {
  const db = await getDB();
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  if (Array.isArray(inventory)) {
    inventory.forEach(item => store.put(item));
    await tx.done;
  }
  db.close();
};

const loadInventoryFromDB = async (): Promise<InventoryItem[]> => {
  const db = await getDB();
  const tx = db.transaction(storeName, 'readonly');
  const store = tx.objectStore(storeName);
  const allItems = await store.getAll();
  db.close();
  return allItems || [];
};

const InventoryPage: React.FC = () => {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [newItemName, setNewItemName] = useState('');
  const [newItemQuantity, setNewItemQuantity] = useState(0);
  const [newItemTag, setNewItemTag] = useState<string | undefined>('');
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editedItemName, setEditedItemName] = useState('');
  const [editedItemQuantity, setEditedItemQuantity] = useState(0);
  const [editedItemTag, setEditedItemTag] = useState<string | undefined>('');
  const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
  const [realTimeChanges, setRealTimeChanges] = useState<{ [itemId: string]: number }>({});
  const [sortColumn, setSortColumn] = useState<keyof InventoryItem | null>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const itemNameInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const loadInitialInventory = async () => {
      const data = await loadInventoryFromDB();
      setInventory(data || []);
    };

    loadInitialInventory();
  }, []);

  useEffect(() => {
    if (Array.isArray(inventory)) {
      saveInventoryToDB(inventory);
    }
  }, [inventory]);

  const handleAddItem = () => {
    if (newItemName.trim() === '' || newItemQuantity === 0) {
      toast({
        title: "Error",
        description: "Item name and quantity cannot be empty.",
        variant: "destructive",
      });
      return;
    }

    const trimmedNewItemName = newItemName.trim();
    const trimmedNewItemTag = newItemTag?.trim();

    // Check if item with same name and tag already exists
    const existingItemIndex = inventory.findIndex(
      item => item.name === trimmedNewItemName &&
             ((newItemTag === undefined || newItemTag === '') ? (item.tag === undefined || item.tag === '') : item.tag === trimmedNewItemTag)
    );

    if (existingItemIndex !== -1) {
      setInventory(prevInventory => {
        return prevInventory.map((item, index) =>
          index === existingItemIndex
            ? { ...item, quantity: item.quantity + newItemQuantity }
            : item
        );
      });
      setRealTimeChanges(prevChanges => ({
        ...prevChanges,
        [inventory[existingItemIndex].id]: (prevChanges[inventory[existingItemIndex].id] || 0) + newItemQuantity,
      }));
      toast({
        title: "Success",
        description: `${newItemName} ${newItemTag ? `(${newItemTag})` : ''} quantity updated.`,
      });
    } else {
      const newItem: InventoryItem = {
        id: Date.now().toString(),
        name: trimmedNewItemName,
        quantity: newItemQuantity,
        tag: trimmedNewItemTag,
      };
      setInventory(prevInventory => {
        return Array.isArray(prevInventory) ? [...prevInventory, newItem] : [newItem];
      });
      setRealTimeChanges(prevChanges => ({
        ...prevChanges,
        [newItem.id]: (prevChanges[newItem.id] || 0) + newItemQuantity,
      }));
      toast({
        title: "Success",
        description: `${newItemName} ${newItemTag ? `(${newItemTag})` : ''} added to inventory.`,
      });
    }

    setNewItemName('');
    setNewItemQuantity(0);
    setNewItemTag('');
    if (itemNameInputRef.current) {
      itemNameInputRef.current.focus();
    }
  };

  const handleEditItem = (item: InventoryItem) => {
    setSelectedItem(item);
    setIsEditDialogOpen(true);
    setEditedItemName(item.name);
    setEditedItemQuantity(item.quantity);
    setEditedItemTag(item.tag || '');
  };

  const handleUpdateItem = () => {
    if (!selectedItem) return;

    setInventory(prevInventory => {
      return prevInventory.map(item =>
        item.id === selectedItem.id
          ? { ...item, name: editedItemName, quantity: editedItemQuantity, tag: editedItemTag }
          : item
      );
    });
    setIsEditDialogOpen(false);
    setSelectedItem(null);
    toast({
      title: "Success",
      description: `${editedItemName} updated successfully.`,
    });
  };

  const handleDeleteItem = (item: InventoryItem) => {
    setSelectedItem(item);
    setIsDeleteConfirmationOpen(true);
  };

  const confirmDeleteItem = () => {
    if (!selectedItem) return;
    setInventory(prevInventory => {
      return prevInventory.filter(item => item.id !== selectedItem.id);
    });
    setIsDeleteConfirmationOpen(false);
    setSelectedItem(null);
    toast({
      title: "Success",
      description: "Item deleted successfully.",
    });
  };

  const handleQuantityChange = (itemId: string, change: number) => {
    setInventory(prevInventory => {
      if (!Array.isArray(prevInventory)) {
        return prevInventory;
      }
      const itemToUpdate = prevInventory.find(item => item.id === itemId);

      if (!itemToUpdate) {
        return prevInventory;
      }

      let updatedQuantity = itemToUpdate.quantity + change;

      // Update real-time changes
      setRealTimeChanges(prevChanges => {
        const currentChange = prevChanges[itemId] || 0;
        return {
          ...prevChanges,
          [itemId]: currentChange + change,
        };
      });

      // Update inventory
      updatedQuantity = Math.max(0, updatedQuantity); // Ensure quantity doesn't go below 0
      return prevInventory.map(item =>
        item.id === itemId ? { ...item, quantity: updatedQuantity } : item
      );
    });
  };

  const handleImportCSV = (file: File | null) => {
    if (!file) return;

    Papa.parse(file, {
      header: true,
      complete: (results) => {
        if (results.data && Array.isArray(results.data)) {
          const importedInventory: InventoryItem[] = results.data.map((row: any) => ({
            id: Date.now().toString(),
            name: row.name || 'Unknown',
            quantity: Number(row.quantity) || 0,
            tag: row.tag || '',
          }));
          setInventory(prevInventory => {
            return Array.isArray(prevInventory) ? [...prevInventory, ...importedInventory] : importedInventory;
          });
          toast({
            title: "Success",
            description: "CSV imported successfully.",
          });
        }
      },
      error: () => {
        toast({
          title: "Error",
          description: "Error importing CSV file.",
          variant: "destructive",
        });
      }
    });
  };

  const handleExportCSV = () => {
    const csv = Papa.unparse({
      fields: ["name", "quantity", "tag"],
      data: inventory.map(item => ({ name: item.name, quantity: item.quantity, tag: item.tag })),
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'inventory.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    toast({
      title: "Success",
      description: "CSV exported successfully.",
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleAddItem();
    }
  };

  const handleSort = (column: keyof InventoryItem) => {
    if (column === sortColumn) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const sortedInventory = useMemo(() => {
    if (!inventory || !Array.isArray(inventory)) return [];
    if (!sortColumn) return inventory;

    return [...inventory].sort((a, b) => {
      const direction = sortDirection === 'asc' ? 1 : -1;

      if (typeof a[sortColumn] === 'number' && typeof b[sortColumn] === 'number') {
        return (a[sortColumn] - b[sortColumn]) * direction;
      }

      const aValue = (a[sortColumn] as string)?.toString() || '';
      const bValue = (b[sortColumn] as string)?.toString() || '';
      return aValue.localeCompare(bValue) * direction;
    });
  }, [inventory, sortColumn, sortDirection]);

  const totalQuantityByName = useMemo(() => {
    if (!inventory || !Array.isArray(inventory)) return {};
    return inventory.reduce((acc: { [name: string]: number }, item) => {
      const key = item.name;
      acc[key] = (acc[key] || 0) + item.quantity;
      return acc;
    }, {});
  }, [inventory]);

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">스마트 재고</h1>

      {/* Data Manipulation Section */}
      <div className="flex space-x-4 mb-4">
        <label htmlFor="importCSV" className="flex items-center space-x-2 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
          <FileInput className="h-4 w-4" />
          <span>CSV 가져오기</span>
          <input
            type="file"
            id="importCSV"
            accept=".csv"
            className="hidden"
            onChange={(e) => handleImportCSV(e.target.files ? e.target.files[0] : null)}
          />
        </label>
        <Button variant="outline" onClick={handleExportCSV}><FileText className="h-4 w-4 mr-2" />CSV 내보내기</Button>
      </div>

      {/* Inventory Table */}
      <Table className="rounded-md shadow-sm">
        <TableCaption>재고 현황</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead onClick={() => handleSort('name')}>
              품목 이름
            </TableHead>
            <TableHead onClick={() => handleSort('quantity')}>
              수량
            </TableHead>
            <TableHead onClick={() => handleSort('tag')}>
              태그
            </TableHead>
            <TableHead className="text-right">작업</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedInventory && sortedInventory.map((item) => {
            const change = realTimeChanges[item.id] || 0;
            return (
              <TableRow key={item.id}>
                <TableCell>
                  {item.name}{" "}
                  {change !== 0 && (
                    <span className={change > 0 ? "text-positive" : "text-destructive"}>
                      ({change > 0 ? "+" : ""}
                      {change})
                    </span>
                  )}
                </TableCell>
                <TableCell>{item.quantity}</TableCell>
                <TableCell>{item.tag}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={() => handleQuantityChange(item.id, 1)}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="icon"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => handleQuantityChange(item.id, -1)}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><line x1="5" x2="19" y1="12" y2="12" /></svg>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEditItem(item)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteItem(item)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Item</DialogTitle>
            <DialogDescription>
              수정할 항목의 이름, 수량, 태그를 변경하세요.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                이름
              </Label>
              <Input
                type="text"
                id="name"
                value={editedItemName}
                onChange={(e) => setEditedItemName(e.target.value)}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="quantity" className="text-right">
                수량
              </Label>
              <Input
                type="number"
                id="quantity"
                value={editedItemQuantity}
                onChange={(e) => setEditedItemQuantity(Number(e.target.value))}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="tag" className="text-right">
                태그
              </Label>
              <Input
                type="text"
                id="tag"
                value={editedItemTag || ''}
                onChange={(e) => setEditedItemTag(e.target.value)}
                className="col-span-3"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" onClick={handleUpdateItem}>저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteConfirmationOpen} onOpenChange={setIsDeleteConfirmationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>삭제 확인</AlertDialogTitle>
            <AlertDialogDescription>
              선택한 항목을 삭제하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsDeleteConfirmationOpen(false)}>취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteItem}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Item Section */}
      <div className="mt-4">
        <div className="flex flex-col gap-2">
          <div className="flex gap-2 items-center">
            <Input
              type="text"
              placeholder="품목 이름"
              value={newItemName}
              onChange={e => setNewItemName(e.target.value)}
              ref={itemNameInputRef}
            />
            <Input
              type="number"
              placeholder="수량"
              value={newItemQuantity === 0 ? '' : newItemQuantity.toString()}
              onChange={e => setNewItemQuantity(Number(e.target.value))}
              onKeyDown={handleKeyDown}
            />
            <Input
              type="text"
              placeholder="태그"
              value={newItemTag || ''}
              onChange={e => setNewItemTag(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
          <Button onClick={handleAddItem} className="w-full"><Plus className="mr-2" /> 품목 추가</Button>
        </div>
      </div>
    </div>
  );
};

export default InventoryPage;
