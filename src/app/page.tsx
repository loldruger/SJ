
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
      if (!db.objectStoreNames.contains(storeName)) {
         db.createObjectStore(storeName, { keyPath: 'id' });
      }
    },
  });
};

const saveInventoryToDB = async (inventory: InventoryItem[]) => {
  try {
    const db = await getDB();
    // Specify transaction type arguments
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    if (Array.isArray(inventory)) {
      // Clear existing store before putting new data (optional, depends on desired behavior)
      await store.clear(); // Clear before adding all current items
      // Use Promise.all for better handling of multiple async operations
      await Promise.all(inventory.map(item => store.put(item)));
    }
    await tx.done; // Ensure transaction completes
  } catch (error) {
     console.error("Failed to save inventory to DB:", error);
     // Optionally, inform the user via toast or other means
  }
};

const loadInventoryFromDB = async (): Promise<InventoryItem[]> => {
 try {
    const db = await getDB();
    // Specify transaction type arguments
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const allItems = await store.getAll();
    // Ensure an array is always returned
    return allItems || [];
 } catch (error) {
    console.error("Failed to load inventory from DB:", error);
    // Optionally, inform the user
    return []; // Return empty array on error
 }
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
        // Initialize realTimeChanges based on loaded data (optional, start fresh)
        // const initialChanges = data.reduce((acc, item) => {
        //   acc[item.id] = 0;
        //   return acc;
        // }, {} as { [itemId: string]: number });
        // setRealTimeChanges(initialChanges);
        setRealTimeChanges({}); // Start with no changes tracked for the new session
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
    // Save whenever inventory changes, but only if it's an array and has items
    // Debounce this or make it less frequent if performance becomes an issue
    if (Array.isArray(inventory) && inventory.length >= 0) { // Allow saving empty inventory state
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
    if (newItemName.trim() === '' || newItemQuantity <= 0) { // Ensure quantity is positive
      toast({
        title: "Error",
        description: "품목 이름과 0보다 큰 수량을 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    const trimmedNewItemName = newItemName.trim();
    const trimmedNewItemTag = newItemTag?.trim() || ''; // Ensure tag is always a string, handle undefined

    // Check if item with same name and tag already exists
    const existingItemIndex = inventory.findIndex(
      (item: InventoryItem) => item.name === trimmedNewItemName &&
             (item.tag || '') === trimmedNewItemTag // Compare trimmed tags or empty strings
    );


    if (existingItemIndex !== -1) {
      // Item exists, update quantity
      const existingItemId = inventory[existingItemIndex].id;
      const originalQuantity = inventory[existingItemIndex].quantity;
      const quantityChange = newItemQuantity; // The change is the quantity of the new item being added

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
          [existingItemId]: currentChange + quantityChange, // Use the added quantity as change
        };
      });
      toast({
        title: "Success",
        description: `${trimmedNewItemName} ${trimmedNewItemTag ? `(${trimmedNewItemTag})` : ''} 수량이 업데이트되었습니다.`,
      });
    } else {
      // Item does not exist, add new item
      const newItem: InventoryItem = {
        id: Date.now().toString() + Math.random().toString(36).substring(2, 15), // More robust ID
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
        description: `${trimmedNewItemName} ${trimmedNewItemTag ? `(${trimmedNewItemTag})` : ''} 품목이 추가되었습니다.`,
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
    setEditedItemTag(item.tag || ''); // Ensure tag is a string for input
  };

  const handleUpdateItem = () => {
    if (!selectedItem) return;

    const trimmedEditedTag = editedItemTag?.trim() || ''; // Trim and handle undefined

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
          ? { ...item, name: editedItemName.trim(), quantity: editedItemQuantity, tag: trimmedEditedTag === '' ? undefined : trimmedEditedTag } // Store empty tag as undefined
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
      description: `${editedItemName} 품목이 수정되었습니다.`,
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
       // Filter out the item
       const newInventory = prevInventory.filter((item: InventoryItem) => item.id !== selectedItem.id);

       // Also remove from realTimeChanges
       setRealTimeChanges(prevChanges => {
           const newChanges = { ...prevChanges };
           delete newChanges[selectedItem.id];
           return newChanges;
       });
       return newInventory; // Return the filtered inventory
    });
    setIsDeleteConfirmationOpen(false);
    setSelectedItem(null);
    toast({
      title: "Success",
      description: "품목이 삭제되었습니다.",
    });
  };


 const handleQuantityChange = (itemId: string, change: number) => {
   // Find the original quantity *before* updating the state
   const originalItem = inventory.find(item => item.id === itemId);
   if (!originalItem) return; // Item not found
   const originalQuantity = originalItem.quantity;

   // Calculate the new quantity
   let newQuantity = originalQuantity + change;
   newQuantity = Math.max(0, newQuantity); // Ensure quantity doesn't go below 0

   // Calculate the actual change that will be applied
   const actualChangeApplied = newQuantity - originalQuantity;

   // Update the inventory state first
   setInventory(prevInventory => {
     if (!Array.isArray(prevInventory)) {
       return prevInventory;
     }
     return prevInventory.map(item =>
       item.id === itemId ? { ...item, quantity: newQuantity } : item
     );
   });

   // Update realTimeChanges state *after* inventory state update,
   // using the actualChangeApplied
   if (actualChangeApplied !== 0) {
     setRealTimeChanges(prevChanges => {
       const currentTrackedChange = prevChanges[itemId] || 0;
       return {
         ...prevChanges,
         [itemId]: currentTrackedChange + actualChangeApplied, // Use the calculated actual change
       };
     });
   }
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
              description: `CSV 가져오기 오류: ${results.errors[0].message}. 자세한 내용은 콘솔을 확인하세요.`,
              variant: "destructive",
            });
            return; // Stop processing if errors occurred
        }

        // Process data if no errors
        if (results.data && Array.isArray(results.data)) {
          const importedInventory: InventoryItem[] = results.data
            .filter((row: any) => row && typeof row === 'object' && row.name && row.name.trim() !== '' && row.quantity !== undefined) // Ensure name and quantity exist
            .map((row: any) => ({
              id: Date.now().toString() + Math.random().toString(36).substring(2, 15),
              name: row.name.trim(),
              quantity: Number(row.quantity) || 0, // Default to 0 if quantity is invalid or missing
              tag: row.tag?.trim() || undefined, // Store empty tag as undefined
            }));

           // Merge imported items with existing inventory
           setInventory(prevInventory => {
             // Ensure prevInventory is an array
             const currentInventory = Array.isArray(prevInventory) ? [...prevInventory] : [];
             const mergedInventory = [...currentInventory];
             const changesToApply: { [itemId: string]: number } = {}; // Track changes for this import

             importedInventory.forEach(newItem => {
               const existingIndex = mergedInventory.findIndex(
                 existingItem => existingItem.name === newItem.name && (existingItem.tag || '') === (newItem.tag || '')
               );
               if (existingIndex !== -1) {
                 const existingId = mergedInventory[existingIndex].id;
                 const originalQuantity = mergedInventory[existingIndex].quantity;
                 mergedInventory[existingIndex].quantity += newItem.quantity;
                 // Track change for this item based on the difference
                 changesToApply[existingId] = (changesToApply[existingId] || 0) + (mergedInventory[existingIndex].quantity - originalQuantity);
               } else {
                 mergedInventory.push(newItem);
                 // Initialize changes for newly imported item (as 0, since it's new)
                 changesToApply[newItem.id] = 0;
               }
             });

            // Apply all tracked changes to realTimeChanges state at once
             setRealTimeChanges(prevChanges => {
               const newChanges = { ...prevChanges };
               for (const itemId in changesToApply) {
                 // For existing items, add the change. For new items, ensure they exist.
                  if (itemId in newChanges || changesToApply[itemId] !== 0) {
                     newChanges[itemId] = (newChanges[itemId] || 0) + changesToApply[itemId];
                  } else {
                      // Ensure new item exists in changes if its change was 0 (just added)
                      if (!(itemId in newChanges)) {
                         newChanges[itemId] = 0;
                      }
                  }
               }
               return newChanges;
             });

            return mergedInventory;
          });

          toast({
            title: "Success",
            description: "CSV 가져오기 완료.",
          });
        } else {
           toast({
             title: "Info",
             description: "CSV 파일에 유효한 데이터가 없습니다.",
           });
        }
       },
       error: (error: Papa.ParseError) => { // Add error handler
         console.error("CSV Parsing Error:", error);
         toast({
           title: "Error",
           description: `CSV 파일 파싱 오류: ${error.message}`,
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
            description: "재고가 비어있어 내보낼 수 없습니다.",
        });
        return;
    }
    const csv = Papa.unparse({
      fields: ["name", "quantity", "tag"],
      // Ensure tag is exported as an empty string if undefined
      data: inventory.map((item: InventoryItem) => ({ name: item.name, quantity: item.quantity, tag: item.tag || '' })),
    });

    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' }); // Add BOM for Excel compatibility
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
      description: "CSV 내보내기 완료.",
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

      // Handle potential undefined values for sorting (treat undefined/null as lowest)
      const aIsNil = aValue === undefined || aValue === null || aValue === '';
      const bIsNil = bValue === undefined || bValue === null || bValue === '';

      if (aIsNil && bIsNil) return 0;
      if (aIsNil) return -1 * direction; // Place nil first in asc
      if (bIsNil) return 1 * direction; // Place nil first in asc

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return (aValue - bValue) * direction;
      }

      // Ensure values are strings for localeCompare
      const aString = String(aValue) || '';
      const bString = String(bValue) || '';
      // Use numeric collation for potentially numeric strings within tags/names if needed
      return aString.localeCompare(bString, undefined, { numeric: true }) * direction;
    });
  }, [inventory, sortColumn, sortDirection]);

  // Item Summary with tags included
  const itemSummary = useMemo(() => {
    if (!inventory || !Array.isArray(inventory)) return {};
    return inventory.reduce((acc: { [name: string]: { quantity: number; tags: Set<string> } }, item: InventoryItem) => {
      const key = item.name;
      if (!acc[key]) {
        acc[key] = { quantity: 0, tags: new Set<string>() };
      }
      acc[key].quantity += item.quantity;
      if (item.tag && item.tag.trim() !== '') {
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
       {/* Header Section */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">재고 관리</h1>
        <div className="flex gap-2">
          <label htmlFor="csvInput" className={cn(buttonVariants({ variant: "outline" }), "cursor-pointer")}>
            <FileInput className="mr-2 h-4 w-4" /> CSV 가져오기
          </label>
          <input id="csvInput" type="file" accept=".csv" onChange={(e) => handleImportCSV(e.target.files ? e.target.files[0] : null)} className="hidden" />
          <Button onClick={handleExportCSV} variant="outline">
            <FileText className="mr-2 h-4 w-4" /> CSV 내보내기
          </Button>
        </div>
      </div>

      {/* Sticky Inventory Table Section */}
      <div className="sticky top-0 bg-background z-10 pt-4 pb-2 border-b mb-4"> {/* Make inventory table sticky */}
         {/* Main Inventory Table Header */}
        <Table className="rounded-md shadow-sm bg-background"> {/* Ensure background for sticky */}
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
       </Table>
      </div>


      {/* Scrollable Content Area (Inventory Items) */}
       <div className="flex-grow overflow-y-auto pb-4"> {/* Adjusted padding */}
          {/* Render Table Body here for scrolling */}
         <Table className="rounded-md shadow-sm mb-4">
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
                       onMouseDown={(e: MouseEvent<HTMLButtonElement>) => e.stopPropagation()} // Prevent row click
                     >
                       <Edit className="h-4 w-4" />
                     </Button>
                     <Button
                       variant="ghost"
                       size="icon"
                       onClick={() => handleDeleteItem(item)}
                       onMouseDown={(e: MouseEvent<HTMLButtonElement>) => e.stopPropagation()} // Prevent row click
                     >
                       <Trash2 className="h-4 w-4" />
                     </Button>
                   </TableCell>
                 </TableRow>
               );
             })}
             {/* Add row for empty state */}
             {(!sortedInventory || sortedInventory.length === 0) && (
                 <TableRow>
                     <TableCell colSpan={4} className="text-center text-muted-foreground h-24">
                         재고 목록이 비어 있습니다.
                     </TableCell>
                 </TableRow>
             )}
           </TableBody>
         </Table>
       </div>

      {/* Sticky Bottom Section (Summary Table and Add Item) */}
      <div className="sticky bottom-0 bg-background border-t mt-auto z-10 p-4"> {/* Use mt-auto and z-10 */}
        {/* Total Quantity by Item Name Table */}
        <div className="mb-4 max-h-48 overflow-y-auto"> {/* Wrap summary table in scrollable container */}
          <Table className="rounded-md shadow-sm">
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
              {Object.entries(itemSummary)
                  .sort(([nameA], [nameB]) => nameA.localeCompare(nameB)) // Sort summary alphabetically by name
                  .map(([name, summary]) => (
                <TableRow key={name}>
                  {/* Apply max-w-xs, whitespace-normal, and break-words */}
                  <TableCell className="whitespace-normal break-words max-w-xs">{name}</TableCell>
                  <TableCell>{summary.quantity}</TableCell>
                  {/* Add new cell for tags */}
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {Array.from(summary.tags)
                          .sort() // Sort tags alphabetically
                          .map((tag: string, index: number) => ( // Add types for tag and index
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
               {/* Add row for empty state */}
               {Object.keys(itemSummary).length === 0 && (
                   <TableRow>
                       <TableCell colSpan={3} className="text-center text-muted-foreground h-16">
                           요약할 품목이 없습니다.
                       </TableCell>
                   </TableRow>
               )}
            </TableBody>
          </Table>
        </div>


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
              onKeyDown={handleKeyDown} // Add key down listener here as well
            />
            <Input
              type="number"
              placeholder="수량"
              value={newItemQuantity <= 0 ? '' : newItemQuantity.toString()} // Handle 0 or negative input
              onChange={(e: ChangeEvent<HTMLInputElement>) => setNewItemQuantity(Math.max(0, Number(e.target.value)))} // Ensure non-negative
              onKeyDown={handleKeyDown} // Add key down listener
              className="w-24" // Fixed width for quantity
              min="1" // Set minimum value for browser validation (optional)
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
          <Button onClick={handleAddItem} className="w-full mt-2"><Plus className="mr-2 h-4 w-4" /> 품목 추가</Button> {/* Ensure Plus icon has size */}
        </div>
      </div>

      {/* Dialogs */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>품목 수정</DialogTitle>
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
                onChange={(e: ChangeEvent<HTMLInputElement>) => setEditedItemQuantity(Math.max(0, Number(e.target.value)))} // Ensure non-negative
                className="col-span-3"
                min="0" // Allow editing to 0
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

