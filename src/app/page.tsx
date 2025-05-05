
"use client";

import type { ChangeEvent, FC, KeyboardEvent, MouseEvent, RefObject } from 'react';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button"; // Import buttonVariants
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"; // Import DialogFooter
import * as Papa from 'papaparse';
import type { IDBPDatabase, DBSchema } from 'idb'; // Import necessary types from idb
import { openDB } from 'idb';
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
  }
  await tx.done; // Ensure transaction completes before closing
  // db.close(); // Closing frequently can be inefficient, consider keeping it open
};

const loadInventoryFromDB = async (): Promise<InventoryItem[]> => {
  const db = await getDB();
  // Specify transaction type arguments
  const tx = db.transaction(storeName, 'readonly');
  const store = tx.objectStore(storeName);
  const allItems = await store.getAll();
  // db.close(); // Consider keeping it open
  // Ensure an array is always returned
  return allItems || [];
};


const InventoryPage: FC = () => {
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
      try {
        const data = await loadInventoryFromDB();
        setInventory(data || []);
      } catch (error) {
        console.error("Failed to load inventory from DB:", error);
        toast({
          title: "Error",
          description: "Failed to load inventory data.",
          variant: "destructive",
        });
        setInventory([]); // Initialize with empty array on error
      }
    };

    loadInitialInventory();
  }, [toast]); // Added toast to dependency array

  useEffect(() => {
    if (inventory && Array.isArray(inventory) && inventory.length > 0) { // Check if inventory has data before saving
      saveInventoryToDB(inventory).catch(error => {
        console.error("Failed to save inventory to DB:", error);
        toast({
          title: "Error",
          description: "Failed to save inventory data.",
          variant: "destructive",
        });
      });
    }
  }, [inventory, toast]); // Added toast to dependency array

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
    const trimmedNewItemTag = newItemTag?.trim() || ''; // Ensure tag is always a string

    // Check if item with same name and tag already exists
    const existingItemIndex = inventory.findIndex(
      (item: InventoryItem) => item.name === trimmedNewItemName &&
             (item.tag || '') === trimmedNewItemTag // Compare trimmed tags or empty strings
    );

    if (existingItemIndex !== -1) {
      // Item exists, update quantity
      const existingItemId = inventory[existingItemIndex].id;
      setInventory((prevInventory: InventoryItem[]) => {
        return prevInventory.map((item: InventoryItem, index: number) =>
          index === existingItemIndex
            ? { ...item, quantity: item.quantity + newItemQuantity }
            : item
        );
      });
      // Update real-time changes for the existing item
      setRealTimeChanges((prevChanges: { [itemId: string]: number }) => {
        const currentChange = prevChanges[existingItemId] || 0;
        return {
          ...prevChanges,
          [existingItemId]: currentChange + newItemQuantity,
        };
      });
      toast({
        title: "Success",
        description: `${trimmedNewItemName} ${trimmedNewItemTag ? `(${trimmedNewItemTag})` : ''} quantity updated.`,
      });
    } else {
      // Item does not exist, add new item
      const newItem: InventoryItem = {
        id: Date.now().toString(),
        name: trimmedNewItemName,
        quantity: newItemQuantity,
        tag: trimmedNewItemTag === '' ? undefined : trimmedNewItemTag, // Store empty tag as undefined
      };
      setInventory((prevInventory: InventoryItem[]) => [...prevInventory, newItem]);
       // Initialize real-time changes for the new item
       setRealTimeChanges((prevChanges: { [itemId: string]: number }) => ({
        ...prevChanges,
        [newItem.id]: 0, // Start with 0 change for new items
      }));
      toast({
        title: "Success",
        description: `${trimmedNewItemName} ${trimmedNewItemTag ? `(${trimmedNewItemTag})` : ''} added to inventory.`,
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

    // Update inventory state
    setInventory((prevInventory: InventoryItem[]) => {
       if (!Array.isArray(prevInventory)) {
          return prevInventory;
        }
      return prevInventory.map((item: InventoryItem) =>
        item.id === selectedItem.id
          ? { ...item, name: editedItemName, quantity: editedItemQuantity, tag: editedItemTag || undefined } // Store empty tag as undefined
          : item
      );
    });

    // Update realTimeChanges state AFTER inventory state is updated
    setRealTimeChanges((prevChanges: { [itemId: string]: number }) => {
      const currentChange = prevChanges[selectedItem.id] || 0;
      return {
        ...prevChanges,
        [selectedItem.id]: currentChange + quantityChange,
      };
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
      // Also remove from realTimeChanges
      setRealTimeChanges(prevChanges => {
          const newChanges = { ...prevChanges };
          delete newChanges[selectedItem.id];
          return newChanges;
      });
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
    // Update real-time changes first
    setRealTimeChanges(prevChanges => {
      const currentChange = prevChanges[itemId] || 0;
      const newChange = currentChange + change;
      // Prevent quantity from going below zero in realTimeChanges preview if necessary
      // This depends on whether you want the preview to reflect potential negative quantity
      // or cap at zero like the actual inventory. Let's cap it for consistency:
      const itemInInventory = inventory.find(item => item.id === itemId);
      const potentialNewQuantity = (itemInInventory?.quantity || 0) + newChange;
      // If potential quantity is negative, adjust the change preview
      // Note: this logic might need refinement based on exact desired preview behavior
      // if (potentialNewQuantity < 0) {
      //    // Adjust change so that preview doesn't show going below zero
      //    // This part can be complex, let's keep it simple for now and reflect the direct change
      // }

      return {
        ...prevChanges,
        [itemId]: newChange,
      };
    });

   // Then update the inventory state
   setInventory(prevInventory => {
     if (!Array.isArray(prevInventory)) {
       return prevInventory;
     }
     const itemToUpdate = prevInventory.find(item => item.id === itemId);
     if (!itemToUpdate) {
       return prevInventory;
     }
     let updatedQuantity = itemToUpdate.quantity + change;
     updatedQuantity = Math.max(0, updatedQuantity); // Ensure quantity doesn't go below 0

     return prevInventory.map(item =>
       item.id === itemId ? { ...item, quantity: updatedQuantity } : item
     );
   });
 };


  const handleImportCSV = (file: File | null) => {
    if (!file) return;

    const config: Papa.ParseConfig<Record<string, any>> = {
      header: true,
      worker: false, // Explicitly set worker to false
      skipEmptyLines: true, // Skip empty lines
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
            .filter((row: any) => row && typeof row === 'object' && row.name && row.name.trim() !== '') // Ensure name is not empty
            .map((row: any) => ({
              id: Date.now().toString() + Math.random().toString(36).substring(2, 15),
              name: row.name.trim(),
              quantity: Number(row.quantity) || 0, // Default to 0 if quantity is invalid
              tag: row.tag?.trim() || undefined, // Store empty tag as undefined
            }));

           // Merge imported items with existing inventory
           setInventory(prevInventory => {
            const mergedInventory = [...prevInventory];
            importedInventory.forEach(newItem => {
              const existingIndex = mergedInventory.findIndex(
                existingItem => existingItem.name === newItem.name && (existingItem.tag || '') === (newItem.tag || '')
              );
              if (existingIndex !== -1) {
                mergedInventory[existingIndex].quantity += newItem.quantity;
                // Update realTimeChanges for merged items
                const existingId = mergedInventory[existingIndex].id;
                 setRealTimeChanges(prev => ({
                    ...prev,
                    [existingId]: (prev[existingId] || 0) + newItem.quantity,
                }));
              } else {
                mergedInventory.push(newItem);
                // Initialize realTimeChanges for newly imported items
                 setRealTimeChanges(prev => ({
                    ...prev,
                    [newItem.id]: 0,
                }));
              }
            });
            return mergedInventory;
          });

          toast({
            title: "Success",
            description: "CSV imported successfully.",
          });
        }
       },
       error: (error: Papa.ParseError) => { // Add error handler
         console.error("CSV Parsing Error:", error);
         toast({
           title: "Error",
           description: `Failed to parse CSV file: ${error.message}`,
           variant: "destructive",
         });
       }
    };

    // Call Papa.parse with the config including worker: false
    Papa.parse(file, config);
  };


  const handleExportCSV = () => {
    if (!inventory || inventory.length === 0) {
        toast({
            title: "Info",
            description: "Inventory is empty. Nothing to export.",
        });
        return;
    }
    const csv = Papa.unparse({
      fields: ["name", "quantity", "tag"],
      // Ensure tag is exported as an empty string if undefined
      data: inventory.map((item: InventoryItem) => ({ name: item.name, quantity: item.quantity, tag: item.tag || '' })),
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }); // Specify charset
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

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
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
      const aValue = a[sortColumn];
      const bValue = b[sortColumn];

      // Handle potential undefined values for sorting
      if (aValue === undefined && bValue === undefined) return 0;
      if (aValue === undefined) return 1 * direction; // undefined sorts last in asc
      if (bValue === undefined) return -1 * direction; // undefined sorts last in asc


      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return (aValue - bValue) * direction;
      }

      // Ensure values are strings for localeCompare
      const aString = String(aValue) || '';
      const bString = String(bValue) || '';
      return aString.localeCompare(bString) * direction;
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
        item.tag.split(',') // Split by comma
           .map(tag => tag.trim()) // Trim whitespace
           .filter(tag => tag !== '') // Remove empty tags
           .forEach((tag: string) => { // Add type for tag
             acc[key].tags.add(tag); // Add tag to the Set
           });
      }
      return acc;
    }, {});
  }, [inventory]);

  return (
     <div className="container mx-auto p-4 flex flex-col h-screen"> {/* Use h-screen for full viewport height */}
      <h1 className="text-2xl font-bold mb-4">재고 관리</h1>

      {/* Sticky Inventory Table Section */}
      <div className="sticky top-0 bg-background z-10 pt-4 pb-2 border-b mb-4"> {/* Make inventory table sticky */}
         {/* Main Inventory Table */}
        <Table className="rounded-md shadow-sm bg-background"> {/* Ensure background for sticky */}
         <TableCaption>재고 현황</TableCaption>
         <TableHeader>
           <TableRow>
             <TableHead onClick={() => handleSort('name')} className="cursor-pointer hover:bg-muted">
               품목 이름 {sortColumn === 'name' ? (sortDirection === 'asc' ? '🔼' : '🔽') : ''}
             </TableHead>
             <TableHead onClick={() => handleSort('quantity')} className="cursor-pointer hover:bg-muted">
               수량 {sortColumn === 'quantity' ? (sortDirection === 'asc' ? '🔼' : '🔽') : ''}
             </TableHead>
             <TableHead onClick={() => handleSort('tag')} className="cursor-pointer hover:bg-muted">
               태그 {sortColumn === 'tag' ? (sortDirection === 'asc' ? '🔼' : '🔽') : ''}
             </TableHead>
             <TableHead className="text-right">작업</TableHead>
           </TableRow>
         </TableHeader>
         {/* Removed TableBody wrapping from sticky section */}
       </Table>
      </div>


      {/* Scrollable Content Area (including Summary Table) */}
       <div className="flex-grow overflow-y-auto pb-[200px]"> {/* Add padding-bottom to prevent overlap */}
          {/* Render Table Body here for scrolling */}
         <Table className="rounded-md shadow-sm mb-4">
            {/* <TableCaption>재고 현황 (Scrollable Body)</TableCaption> */}
             {/* No Header here, it's sticky above */}
            <TableBody>
             {sortedInventory && sortedInventory.map((item: InventoryItem) => { // Add type for item
               const change = realTimeChanges[item.id] || 0;
               return (
                 <TableRow key={item.id}>
                   {/* Apply max-w-xs to constrain width */}
                   <TableCell className="font-medium whitespace-normal break-words max-w-xs">{item.name}
                   {change !== 0 && (
                    <span className={cn("ml-1 text-xs", change > 0 ? "text-positive" : "text-destructive")}>
                       ({change > 0 ? "+" : ""}{change})
                    </span>
                   )}
                   </TableCell>
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
                             // Use Badge component for tags
                             <Badge key={`${item.id}-tag-${index}`} variant="secondary" className="font-normal rounded-sm">{tag}</Badge>
                         ))}
                       </div>
                     ) : null}
                   </TableCell>
                   {/* Add whitespace-nowrap to prevent shrinking/wrapping */}
                   <TableCell className="text-right whitespace-nowrap">
                     <Button
                       variant="ghost" // Changed variant to ghost
                       size="icon"
                       onClick={() => handleQuantityChange(item.id, 1)}
                       onMouseDown={(e: MouseEvent<HTMLButtonElement>) => e.stopPropagation()} // Add type for e
                     >
                       <Plus className="h-4 w-4 text-positive" /> {/* Positive color */}
                     </Button>
                     <Button
                       variant="ghost" // Changed variant to ghost
                       size="icon"
                       onClick={() => handleQuantityChange(item.id, -1)}
                       onMouseDown={(e: MouseEvent<HTMLButtonElement>) => e.stopPropagation()} // Add type for e
                     >
                       {/* Use Minus icon from lucide-react */}
                       <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-destructive"><line x1="5" x2="19" y1="12" y2="12" /></svg>
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
       </div>

      {/* Sticky Bottom Section (Summary Table and Add Item) */}
      <div className="sticky bottom-0 bg-background border-t mt-auto z-10 p-4"> {/* Use mt-auto and z-10 */}
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
                        variant="secondary" // Use secondary variant for consistency
                        className="font-normal rounded-sm bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200 hover:text-amber-900"
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


         {/* Add Item Section */}
        <h2 className="text-xl font-semibold mb-2">품목 추가</h2>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2 items-center">
            <Input
              type="text"
              placeholder="품목 이름"
              value={newItemName}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setNewItemName(e.target.value)} // Add type for e
              ref={itemNameInputRef} // Assign ref here
              className="flex-1" // Allow input to grow
            />
            <Input
              type="number"
              placeholder="수량"
              value={newItemQuantity === 0 ? '' : newItemQuantity.toString()}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setNewItemQuantity(Number(e.target.value))} // Add type for e
              onKeyDown={handleKeyDown} // Add key down listener
              className="w-24" // Fixed width for quantity
            />
            <Input
              type="text"
              placeholder="태그 (쉼표로 구분)" // Update placeholder
              value={newItemTag || ''}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setNewItemTag(e.target.value)} // Add type for e
              onKeyDown={handleKeyDown} // Add key down listener
              className="flex-1" // Allow input to grow
            />
          </div>
          <div className="flex gap-2 mt-2">
             <label htmlFor="csvInput" className={cn(buttonVariants({ variant: "outline" }), "cursor-pointer w-1/2")}>
                <FileInput className="mr-2" /> CSV 가져오기
             </label>
             <input id="csvInput" type="file" accept=".csv" onChange={(e) => handleImportCSV(e.target.files ? e.target.files[0] : null)} className="hidden" />
             <Button onClick={handleExportCSV} variant="outline" className="w-1/2"><FileText className="mr-2" /> CSV 내보내기</Button>
           </div>
          <Button onClick={handleAddItem} className="w-full mt-2"><Plus className="mr-2 h-4 w-4" /> 품목 추가</Button> {/* Ensure Plus icon has size */}
        </div>
      </div>

      {/* Dialogs */}
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
                onChange={(e: ChangeEvent<HTMLInputElement>) => setEditedItemName(e.target.value)} // Add type for e
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
                onChange={(e: ChangeEvent<HTMLInputElement>) => setEditedItemQuantity(Number(e.target.value))} // Add type for e
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
                onChange={(e: ChangeEvent<HTMLInputElement>) => setEditedItemTag(e.target.value)} // Add type for e
                className="col-span-3"
                placeholder="쉼표로 구분" // Add placeholder
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" onClick={handleUpdateItem}>저장</Button>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>취소</Button> {/* Add Cancel button */}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteConfirmationOpen} onOpenChange={setIsDeleteConfirmationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>삭제 확인</AlertDialogTitle>
            <AlertDialogDescription>
              선택한 항목{' '}
              <span className="font-semibold">{selectedItem?.name} {selectedItem?.tag ? `(${selectedItem.tag})` : ''}</span>
              을(를) 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsDeleteConfirmationOpen(false)}>취소</AlertDialogCancel>
             {/* Apply destructive variant directly */}
            <AlertDialogAction onClick={confirmDeleteItem} className={cn(buttonVariants({ variant: "destructive" }))}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default InventoryPage;

