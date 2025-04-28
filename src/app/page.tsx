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
import { IDBPDatabase, openDB, IDBPTransaction, DBSchema } from 'idb'; // Import necessary types from idb
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  tag?: string;
}

// Define a schema for the database (optional but good practice)
interface InventoryDBSchema extends DBSchema {
  'inventory-store': {
    key: string;
    value: InventoryItem;
  };
}

const storeName = 'inventory-store';
const dbName = 'inventory-db';

const getDB = async (): Promise<IDBPDatabase<InventoryDBSchema>> => { // Use the schema
  return openDB<InventoryDBSchema>(dbName, 1, { // Use the schema
    upgrade(db: IDBPDatabase<InventoryDBSchema>) { // Add type for db
      db.createObjectStore(storeName, { keyPath: 'id' });
    },
  });
};

const saveInventoryToDB = async (inventory: InventoryItem[]) => {
  const db = await getDB();
  // Specify transaction type arguments
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  if (Array.isArray(inventory)) {
    // Use Promise.all for better handling of multiple async operations
    await Promise.all(inventory.map(item => store.put(item)));
    await tx.done;
  }
  db.close();
};

const loadInventoryFromDB = async (): Promise<InventoryItem[]> => {
  const db = await getDB();
  // Specify transaction type arguments
  const tx = db.transaction(storeName, 'readonly');
  const store = tx.objectStore(storeName);
  const allItems = await store.getAll();
  db.close();
  // Ensure an array is always returned
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
    if (inventory && Array.isArray(inventory)) {
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
    const existingItemIndex = inventory && Array.isArray(inventory) ? inventory.findIndex(
      (item: InventoryItem) => item.name === trimmedNewItemName &&
             ((newItemTag === undefined || newItemTag === '') ? (item.tag === undefined || item.tag === '') : item.tag === trimmedNewItemTag)
    ) : -1;

    if (existingItemIndex !== -1) {
      setInventory((prevInventory: InventoryItem[]) => {
        if (!Array.isArray(prevInventory)) {
          return prevInventory;
        }
        return prevInventory.map((item: InventoryItem, index: number) =>
          index === existingItemIndex
            ? { ...item, quantity: item.quantity + newItemQuantity }
            : item
        );
      });
      setRealTimeChanges((prevChanges: { [itemId: string]: number }) => {
        const currentChange = prevChanges[inventory[existingItemIndex].id] || 0;
        return {
          ...prevChanges,
          [inventory[existingItemIndex].id]: currentChange + newItemQuantity,
        };
      });
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
      setInventory((prevInventory: InventoryItem[]) => {
         if (!Array.isArray(prevInventory)) {
          return [newItem];
        }
        return [...prevInventory, newItem];
      });
      setRealTimeChanges((prevChanges: { [itemId: string]: number }) => ({
        ...prevChanges,
        [newItem.id]: 0,
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

    // Find the original item to calculate the quantity difference
    const originalItem = inventory.find((item: InventoryItem) => item.id === selectedItem.id);
    if (!originalItem) return; // Should not happen, but good practice

    const quantityChange = editedItemQuantity - originalItem.quantity;

    // Update realTimeChanges state
    setRealTimeChanges((prevChanges: { [itemId: string]: number }) => {
      const currentChange = prevChanges[selectedItem.id] || 0;
      return {
        ...prevChanges,
        [selectedItem.id]: currentChange + quantityChange,
      };
    });

    setInventory((prevInventory: InventoryItem[]) => {
       if (!Array.isArray(prevInventory)) {
          return prevInventory;
        }
      return prevInventory.map((item: InventoryItem) =>
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
    setInventory((prevInventory: InventoryItem[]) => {
       if (!Array.isArray(prevInventory)) {
          return prevInventory;
        }
      return prevInventory.filter((item: InventoryItem) => item.id !== selectedItem.id);
    });
    setIsDeleteConfirmationOpen(false);
    setSelectedItem(null);
    toast({
      title: "Success",
      description: "Item deleted successfully.",
    });
  };

  const handleQuantityChange = (itemId: string, change: number) => {
     setRealTimeChanges((prevChanges: { [itemId: string]: number }) => {
       const currentChange = prevChanges[itemId] || 0;
       return {
         ...prevChanges,
         [itemId]: currentChange + change,
       };
     });
    setInventory((prevInventory: InventoryItem[]) => {
       if (!Array.isArray(prevInventory)) {
         return prevInventory;
       }
      const itemToUpdate = prevInventory.find((item: InventoryItem) => item.id === itemId);

      if (!itemToUpdate) {
        return prevInventory;
      }

      let updatedQuantity = itemToUpdate.quantity + change;
      updatedQuantity = Math.max(0, updatedQuantity);
      return prevInventory.map((item: InventoryItem) =>
        item.id === itemId ? { ...item, quantity: updatedQuantity } : item
      );
    });
  };

  const handleImportCSV = (file: File | null) => {
    if (!file) return;

    const config: Papa.ParseConfig<Record<string, any>> = {
      header: true,
      worker: false, // Explicitly set worker to false
      complete: (results: Papa.ParseResult<Record<string, any>>) => {
        // Check for parsing errors within the results
        if (results.errors && results.errors.length > 0) {
            console.error("CSV Import Errors:", results.errors);
            toast({
              title: "Error",
              description: `Error importing CSV file: ${results.errors[0].message}. Check console for details.`,
              variant: "destructive",
            });
            return; // Stop processing if errors occurred
        }

        // Process data if no errors
        if (results.data && Array.isArray(results.data)) {
          const importedInventory: InventoryItem[] = results.data
            .filter((row: any) => row && typeof row === 'object' && row.name)
            .map((row: any) => ({
              id: Date.now().toString() + Math.random().toString(36).substring(2, 15),
              name: row.name || 'Unknown',
              quantity: Number(row.quantity) || 0,
              tag: row.tag || '',
            }));
          setInventory((prevInventory: InventoryItem[]) => {
            return Array.isArray(prevInventory) ? [...prevInventory, ...importedInventory] : importedInventory;
          });
          toast({
            title: "Success",
            description: "CSV imported successfully.",
          });
        }
       },
    };

    // Call Papa.parse with the config including worker: false
    Papa.parse(file, config);
  };

  const handleExportCSV = () => {
    const csv = Papa.unparse({
      fields: ["name", "quantity", "tag"],
      data: inventory.map((item: InventoryItem) => ({ name: item.name, quantity: item.quantity, tag: item.tag })),
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

  // Modify this useMemo hook
  const itemSummary = useMemo(() => {
    if (!inventory || !Array.isArray(inventory)) return {};
    return inventory.reduce((acc: { [name: string]: { quantity: number; tags: Set<string> } }, item: InventoryItem) => {
      const key = item.name;
      if (!acc[key]) {
        acc[key] = { quantity: 0, tags: new Set<string>() };
      }
      acc[key].quantity += item.quantity;
      if (item.tag) {
        item.tag.split(',').forEach((tag: string) => { // Add type for tag
          const trimmedTag = tag.trim();
          if (trimmedTag !== '') {
            acc[key].tags.add(trimmedTag);
          }
        });
      }
      return acc;
    }, {});
  }, [inventory]);

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">스마트 재고</h1>
      {/* Data Manipulation Section */}
      <div className="flex space-x-4 mb-4">
        <label htmlFor="importCSV" className="flex items-center space-x-2 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"> {/* Added cursor-pointer */}
          <FileInput className="h-4 w-4" />
          <span>CSV 가져오기</span>
          <input
            type="file"
            id="importCSV"
            accept=".csv"
            className="hidden"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleImportCSV(e.target.files ? e.target.files[0] : null)} // Add type for e
          />
        </label>
        <Button variant="outline" onClick={handleExportCSV}><FileText className="h-4 w-4 mr-2" />CSV 내보내기</Button>
      </div>
       {/* Inventory Table */}
       <Table className="rounded-md shadow-sm mb-8">
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
          {sortedInventory && sortedInventory.map((item: InventoryItem) => { // Add type for item
            const change = realTimeChanges[item.id] || 0;
            return (
              <TableRow key={item.id}>
                {/* Apply max-w-xs to constrain width */}
                <TableCell className="font-medium whitespace-normal break-words max-w-xs">{item.name}</TableCell>
                <TableCell>
                  {item.quantity}
                </TableCell>
                {/* Apply whitespace-normal to Tag cell */}
                <TableCell className="whitespace-normal">
                  {item.tag && item.tag.trim() !== '' ? (
                    <div className="flex flex-wrap gap-1">
                      {item.tag.split(',')
                        .map((tag: string) => tag.trim()) // Add type for tag
                        .filter((tag: string) => tag !== '') // Add type for tag
                        .map((tag: string, index: number) => ( // Add types for tag and index
                          <Badge key={`${item.id}-tag-${index}`} variant="default" className="font-medium">{tag}</Badge> // Use a more unique key
                    ))}
                    </div>
                  ) : null}
                </TableCell>
                {/* Add whitespace-nowrap to prevent shrinking/wrapping */}
                <TableCell className="text-right whitespace-nowrap">
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={() => handleQuantityChange(item.id, 1)}
                    onMouseDown={(e: React.MouseEvent<HTMLButtonElement>) => e.stopPropagation()} // Add type for e
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={() => handleQuantityChange(item.id, -1)}
                       onMouseDown={(e: React.MouseEvent<HTMLButtonElement>) => e.stopPropagation()} // Add type for e
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

       {/* Total Quantity by Item Name Table */}
       <Table className="rounded-md shadow-sm mb-4">
        <TableCaption>품목별 총 수량 및 태그</TableCaption> {/* Update caption */}
        <TableHeader>
          <TableRow>
            <TableHead>품목 이름</TableHead>
            <TableHead>총 수량</TableHead>
            <TableHead>태그</TableHead> {/* Add new header */}
          </TableRow>
        </TableHeader>
        <TableBody>
          {/* Update map function to use itemSummary */}
          {Object.entries(itemSummary).map(([name, summary]) => (
            <TableRow key={name}>
              {/* Apply max-w-xs, whitespace-normal, and break-words */}
              <TableCell className="whitespace-normal break-words max-w-xs">{name}</TableCell>
              <TableCell>{summary.quantity}</TableCell>
              {/* Add new cell for tags */}
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {Array.from(summary.tags).map((tag: string, index: number) => ( // Add types for tag and index
                    // Add hover:bg-amber-200 and hover:text-amber-900 for hover effect
                    <Badge
                      key={`${name}-tag-${index}`}
                      className="font-normal bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200 hover:text-amber-900"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </TableCell>
            </TableRow>
          ))}
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
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditedItemName(e.target.value)} // Add type for e
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
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditedItemQuantity(Number(e.target.value))} // Add type for e
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
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditedItemTag(e.target.value)} // Add type for e
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
      <div className="sticky bottom-0 bg-background p-4 border-t mt-4">
        <div className="flex flex-col gap-2">
          <div className="flex gap-2 items-center">
            <Input
              type="text"
              placeholder="품목 이름"
              value={newItemName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewItemName(e.target.value)} // Add type for e
              ref={itemNameInputRef}
            />
            <Input
              type="number"
              placeholder="수량"
              value={newItemQuantity === 0 ? '' : newItemQuantity.toString()}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewItemQuantity(Number(e.target.value))} // Add type for e
              onKeyDown={handleKeyDown}
            />
            <Input
              type="text"
              placeholder="태그"
              value={newItemTag || ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewItemTag(e.target.value)} // Add type for e
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
