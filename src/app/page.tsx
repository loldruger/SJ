"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2, Edit, FileInput, FileText, Plus, ArrowUp, ArrowDown, Minus } from 'lucide-react';
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

interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  tag?: string;
}

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
  const { toast } = useToast();

  useEffect(() => {
    // Load initial inventory data (can be replaced with API call)
    const initialData = [
      { id: "1", name: "바나나", quantity: 50, tag: "19층" },
      { id: "2", name: "사과", quantity: 75, tag: "12층" },
      { id: "3", name: "우유", quantity: 30 },
    ];
    setInventory(initialData);
  }, []);

  const handleAddItem = () => {
    if (newItemName.trim() === '' || newItemQuantity === 0) {
      toast({
        title: "Error",
        description: "Item name and quantity cannot be empty.",
        variant: "destructive",
      });
      return;
    }

    // Check if item with same name and tag already exists
    const existingItemIndex = inventory.findIndex(
      item => item.name === newItemName && (newItemTag === undefined ? item.tag === undefined : item.tag === newItemTag)
    );

    if (existingItemIndex !== -1) {
      // Increase quantity of existing item
      const updatedInventory = [...inventory];
      updatedInventory[existingItemIndex].quantity += newItemQuantity;
      setInventory(updatedInventory);
      toast({
        title: "Success",
        description: `${newItemName} ${newItemTag ? `(${newItemTag})` : ''} quantity updated.`,
      });
    } else {
      // Add new item
      const newItem: InventoryItem = {
        id: Date.now().toString(),
        name: newItemName,
        quantity: newItemQuantity,
        tag: newItemTag,
      };
      setInventory([...inventory, newItem]);
      toast({
        title: "Success",
        description: `${newItemName} ${newItemTag ? `(${newItemTag})` : ''} added to inventory.`,
      });
    }

    setNewItemName('');
    setNewItemQuantity(0);
    setNewItemTag('');
  };

  const handleEditItem = (item: InventoryItem) => {
    setSelectedItem(item);
    setEditedItemName(item.name);
    setEditedItemQuantity(item.quantity);
    setEditedItemTag(item.tag);
    setIsEditDialogOpen(true);
  };

  const handleUpdateItem = () => {
    if (!selectedItem) return;

    const updatedInventory = inventory.map(item =>
      item.id === selectedItem.id ? {
        ...item,
        name: editedItemName,
        quantity: editedItemQuantity,
        tag: editedItemTag,
      } : item
    );
    setInventory(updatedInventory);
    setIsEditDialogOpen(false);
    setSelectedItem(null);
    toast({
      title: "Success",
      description: `${editedItemName} updated.`,
    });
  };

  const handleDeleteItem = (item: InventoryItem) => {
    setSelectedItem(item);
    setIsDeleteConfirmationOpen(true);
  };

  const confirmDeleteItem = () => {
    if (!selectedItem) return;

    const updatedInventory = inventory.filter(item => item.id !== selectedItem.id);
    setInventory(updatedInventory);
    setIsDeleteConfirmationOpen(false);
    setSelectedItem(null);
    toast({
      title: "Success",
      description: `${selectedItem.name} deleted.`,
    });
  };

  const handleQuantityChange = (itemId: string, change: number) => {
    setInventory(prevInventory => {
      const itemToUpdate = prevInventory.find(item => item.id === itemId);
      if (!itemToUpdate) return prevInventory;

      const updatedQuantity = itemToUpdate.quantity + change;

      // 품목 수량이 0 미만으로 내려가지 않도록 제한
      if (updatedQuantity < 0) {
        toast({
          title: "Error",
          description: "품목 수량은 0 미만이 될 수 없습니다.",
          variant: "destructive",
        });
        return prevInventory;
      }

      return prevInventory.map(item =>
        item.id === itemId ? { ...item, quantity: updatedQuantity } : item
      );
    });

    setRealTimeChanges(prevChanges => ({
      ...prevChanges,
      [itemId]: (prevChanges[itemId] || 0) + change,
    }));

    // Clear the real-time change indicator after a short delay
    setTimeout(() => {
      setRealTimeChanges(prevChanges => {
        const { [itemId]: removedItem, ...rest } = prevChanges;
        return rest;
      });
    }, 2000);
  };

  const handleImportCSV = (file: File | null) => {
    if (!file) {
      toast({
        title: "Error",
        description: "No file selected.",
        variant: "destructive",
      });
      return;
    }

    Papa.parse(file, {
      header: true,
      complete: (results) => {
        const importedData = results.data as any[];
        if (importedData && importedData.length > 0) {
          const newInventoryItems: InventoryItem[] = importedData.map(item => ({
            id: Date.now().toString(),
            name: item.name || 'Unknown',
            quantity: parseInt(item.quantity || '0', 10),
            tag: item.tag || '',
          }));
          setInventory([...inventory, ...newInventoryItems]);
          toast({
            title: "Success",
            description: "CSV file imported successfully.",
          });
        } else {
          toast({
            title: "Error",
            description: "Failed to import CSV file.",
            variant: "destructive",
          });
        }
      },
      error: () => {
        toast({
          title: "Error",
          description: "Error parsing CSV file.",
          variant: "destructive",
        });
      }
    });
  };

  const handleExportCSV = () => {
    const csvData = Papa.unparse({
      fields: ["id", "name", "quantity", "tag"],
      data: inventory.map(item => ({
        ...item,
      })),
    });

    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "inventory.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({
      title: "Success",
      description: "Inventory exported to CSV.",
    });
  };

  const handleSort = (column: keyof InventoryItem) => {
    if (column === sortColumn) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const sortedInventory = React.useMemo(() => {
    if (!sortColumn) return inventory;

    return [...inventory].sort((a, b) => {
      const direction = sortDirection === 'asc' ? 1 : -1;

      if (typeof a[sortColumn] === 'number' && typeof b[sortColumn] === 'number') {
        return direction * ((a[sortColumn] || 0) - (b[sortColumn] || 0));
      }

      const aValue = String(a[sortColumn] || '').toUpperCase();
      const bValue = String(b[sortColumn] || '').toUpperCase();

      if (aValue < bValue) {
        return -1 * direction;
      }
      if (aValue > bValue) {
        return 1 * direction;
      }
      return 0;
    });
  }, [inventory, sortColumn, sortDirection]);

  const totalQuantityByName = useMemo(() => {
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
      <div className="mb-4 flex gap-2">
        <label htmlFor="importCSV" className="flex items-center space-x-2 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
          <FileInput className="h-4 w-4" />
          <span>CSV 가져오기</span>
          <input
            type="file"
            id="importCSV"
            accept=".csv"
            onChange={(e) => handleImportCSV(e.target.files ? e.target.files[0] : null)}
            className="hidden"
          />
        </label>
        <Button variant="outline" onClick={handleExportCSV}><FileText className="mr-2" /> 내보내기 CSV</Button>
      </div>

      {/* Inventory Table */}
      <Table className="rounded-md shadow-sm">
        <TableCaption>재고 현황</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead onClick={() => handleSort('name')} className="cursor-pointer">
              이름
              {sortColumn === 'name' && (sortDirection === 'asc' ? <ArrowUp className="inline ml-1 h-4 w-4" /> : <ArrowDown className="inline ml-1 h-4 w-4" />)}
            </TableHead>
            <TableHead onClick={() => handleSort('quantity')} className="cursor-pointer">
              수량
              {sortColumn === 'quantity' && (sortDirection === 'asc' ? <ArrowUp className="inline ml-1 h-4 w-4" /> : <ArrowDown className="inline ml-1 h-4 w-4" />)}
            </TableHead>
            <TableHead onClick={() => handleSort('tag')} className="cursor-pointer">
              태그
              {sortColumn === 'tag' && (sortDirection === 'asc' ? <ArrowUp className="inline ml-1 h-4 w-4" /> : <ArrowDown className="inline ml-1 h-4 w-4" />)}
            </TableHead>
            <TableHead className="text-right">작업</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedInventory.map((item) => (
            <TableRow key={item.id}>
              <TableCell>{item.name} {realTimeChanges[item.id] !== 0 && (<span className={realTimeChanges[item.id] > 0 ? "text-positive" : "text-accent"}>({realTimeChanges[item.id] > 0 ? "+" : ""}{realTimeChanges[item.id]})</span>)}</TableCell>
              <TableCell>{item.quantity}</TableCell>
              <TableCell>
                {item.tag}
              </TableCell>
              <TableCell className="text-right">
                <Button variant="secondary" size="icon" onClick={() => handleQuantityChange(item.id, 1)}><Plus className="h-4 w-4" /></Button>
                <Button variant="secondary" size="icon" onClick={() => handleQuantityChange(item.id, -1)}><Minus className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" onClick={() => handleEditItem(item)}><Edit className="h-4 w-4" /></Button>
                <Button variant="destructive" size="icon" onClick={() => handleDeleteItem(item)}><Trash2 className="h-4 w-4" /></Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Item Name Specific Quantity */}
      <div className="mt-4 rounded-md shadow-sm p-4 bg-secondary">
        <h2 className="text-lg font-semibold mb-2">품목별 총 수량</h2>
        <ul>
          {Object.entries(totalQuantityByName).map(([name, quantity]) => (
            <li key={name} className="mb-1">
              {name}: {quantity}
            </li>
          ))}
        </ul>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>품목 편집</DialogTitle>
            <DialogDescription>
              품목 정보를 수정하십시오.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                이름
              </Label>
              <Input id="name" value={editedItemName} onChange={(e) => setEditedItemName(e.target.value)} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="quantity" className="text-right">
                수량
              </Label>
              <Input
                type="number"
                id="quantity"
                value={editedItemQuantity === 0 ? '' : editedItemQuantity.toString()}
                onChange={(e) => setEditedItemQuantity(Number(e.target.value))}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="tag" className="text-right">
                태그
              </Label>
              <Input id="tag" value={editedItemTag} onChange={(e) => setEditedItemTag(e.target.value)} className="col-span-3" />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" onClick={handleUpdateItem}>저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteConfirmationOpen} onOpenChange={setIsDeleteConfirmationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>삭제 확인</AlertDialogTitle>
            <AlertDialogDescription>
              정말로 이 품목을 삭제하시겠습니까?
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
            />
            <Input
              type="number"
              placeholder="수량"
              value={newItemQuantity === 0 ? '' : newItemQuantity.toString()}
              onChange={e => setNewItemQuantity(Number(e.target.value))}
            />
            <Input
              type="text"
              placeholder="태그"
              value={newItemTag || ''}
              onChange={e => setNewItemTag(e.target.value)}
            />
          </div>
          <Button onClick={handleAddItem} className="w-full"><Plus className="mr-2" /> 품목 추가</Button>
        </div>
      </div>
    </div>
  );
};

export default InventoryPage;
