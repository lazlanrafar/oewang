"use client";

import * as React from "react";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Dictionary } from "@workspace/dictionaries";
import {
  createCategory,
  deleteCategory,
  getExpenseCategories,
  getIncomeCategories,
  reorderCategories,
  updateCategory,
} from "@workspace/modules/category/category.action";
import type { Category } from "@workspace/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Separator,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui";
import { GripVertical, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";

interface SortableRowProps {
  category: Category;
  handleEdit: (category: Category) => void;
  handleDeleteClick: (category: Category) => void;
}

function SortableRow({ category, handleEdit, handleDeleteClick }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: category.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1 : 0,
    position: isDragging ? "relative" : undefined,
  } as React.CSSProperties;

  return (
    <TableRow ref={setNodeRef} style={style} className={isDragging ? "bg-muted/50" : ""}>
      <TableCell className="font-medium">
        <Button variant="ghost" size="icon" className="cursor-move" {...attributes} {...listeners}>
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </Button>

        {category.name}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="icon" onClick={() => handleEdit(category)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive/90"
            onClick={() => handleDeleteClick(category)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function CategorySkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <Skeleton className="h-6 w-48 rounded-none" />
        <Skeleton className="h-4 w-72 rounded-none" />
      </div>
      <Separator className="rounded-none" />
      <div className="flex justify-end pt-4">
        <Skeleton className="h-8 w-32 rounded-none" />
      </div>
      <div className="rounded-none border bg-background">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>
                <Skeleton className="h-4 w-24 rounded-none" />
              </TableHead>
              <TableHead className="w-[100px] text-right">
                <Skeleton className="float-right h-4 w-16 rounded-none" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[1, 2, 3].map((i) => (
              <TableRow key={i} className="">
                <TableCell className="py-4">
                  <Skeleton className="h-4 w-40 rounded-none text-xs" />
                </TableCell>
                <TableCell className="py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <Skeleton className="size-8 rounded-none" />
                    <Skeleton className="size-8 rounded-none" />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function CategoryForm({ type, dictionary }: { type: "income" | "expense"; dictionary: Dictionary }) {
  const dictionary_t = type === "income" ? dictionary.settings.category.income : dictionary.settings.category.expense;

  const [isOpen, setIsOpen] = React.useState(false);
  const [activeCategory, setActiveCategory] = React.useState<Category | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [categoryToDelete, setCategoryToDelete] = React.useState<Category | null>(null);
  const [items, setItems] = React.useState<Category[]>([]);

  const queryClient = useQueryClient();
  const queryKey = ["categories", type];
  // Schema matches dictionary messages
  const formSchema = React.useMemo(
    () =>
      z.object({
        name: z.string().min(1, {
          message: dictionary_t.form.name.error_required || "Name is required",
        }),
      }),
    [dictionary_t],
  );

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
    },
  });

  // Query
  const { data: categories, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const result = await (type === "income" ? getIncomeCategories() : getExpenseCategories());
      if (result.success) return result.data;
      throw new Error(result.error);
    },
  });

  React.useEffect(() => {
    if (categories) {
      setItems(categories);
    }
  }, [categories]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !active) return;
    if (active.id !== over.id) {
      setItems((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);

        const newItems = arrayMove(items, oldIndex, newIndex);

        // Optimistic update
        const updates = newItems.map((item, index) => ({
          id: item.id,
          sortOrder: index,
        }));

        // Trigger server update
        reorderMutation.mutate(updates);

        return newItems;
      });
    }
  };

  // Mutations
  const createMutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      const result = await createCategory({
        name: data.name,
        type,
      });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success(dictionary_t.form.create_success);
      setIsOpen(false);
      form.reset();
    },
    onError: (error) => {
      toast.error(`${dictionary.common.error || "Error"}: ${(error as Error).message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      if (!activeCategory) throw new Error("No active category");
      const result = await updateCategory(activeCategory.id, {
        name: data.name,
      });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success(dictionary_t.form.update_success);
      setIsOpen(false);
      setActiveCategory(null);
      form.reset();
    },
    onError: (error) => {
      toast.error(`${dictionary.common.error || "Error"}: ${(error as Error).message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteCategory(id);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success(dictionary_t.form.delete_success);
      setIsDeleteDialogOpen(false);
      setCategoryToDelete(null);
    },
    onError: (error) => {
      toast.error(`${dictionary.common.error || "Error"}: ${(error as Error).message}`);
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (updates: { id: string; sortOrder: number }[]) => {
      const result = await reorderCategories(updates);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey });

      const previousCategories = queryClient.getQueryData<Category[]>(queryKey);

      queryClient.setQueryData<Category[]>(queryKey, (old) => {
        if (!old) return [];

        const newItems = [...old];
        updates.forEach((update) => {
          const item = newItems.find((i) => i.id === update.id);
          if (item) {
            item.sortOrder = update.sortOrder;
          }
        });

        return newItems.sort((a, b) => a.sortOrder - b.sortOrder);
      });

      return { previousCategories };
    },
    onError: (error, _, context) => {
      toast.error(`${dictionary.common.error || "Error"}: ${(error as Error).message}`);
      if (context?.previousCategories) {
        queryClient.setQueryData(queryKey, context.previousCategories);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    if (activeCategory) {
      updateMutation.mutate(values);
    } else {
      createMutation.mutate(values);
    }
  };

  const handleEdit = (category: Category) => {
    setActiveCategory(category);
    form.reset({
      name: category.name,
    });
    setIsOpen(true);
  };

  const handleDeleteClick = (category: Category) => {
    setCategoryToDelete(category);
    setIsDeleteDialogOpen(true);
  };

  const handleDialogChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setActiveCategory(null);
      form.reset();
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  if (isLoading || !dictionary_t) {
    return <CategorySkeleton />;
  }

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h2 className="font-medium text-lg tracking-tight">{dictionary_t.title}</h2>
        <p className="text-muted-foreground text-xs">{dictionary_t.description}</p>
      </div>
      <Separator className="rounded-none" />

      <div className="space-y-4">
        <div className="flex justify-end">
          <Dialog open={isOpen} onOpenChange={handleDialogChange}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-8 rounded-none font-normal text-xs">
                <Plus className="mr-2 h-3.5 w-3.5" />
                {dictionary_t.add_button}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm rounded-none">
              <DialogHeader>
                <DialogTitle className="font-medium text-base tracking-tight">
                  {activeCategory ? dictionary_t.form.submit : dictionary_t.add_button}
                </DialogTitle>
                <DialogDescription className="text-xs">{dictionary_t.description}</DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-medium text-xs">{dictionary_t.form.name.label}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={dictionary_t.form.name.placeholder}
                            {...field}
                            className="h-9 rounded-none text-sm"
                          />
                        </FormControl>
                        <FormMessage className="text-[11px]" />
                      </FormItem>
                    )}
                  />
                  <DialogFooter className="pt-2">
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="h-8 w-full rounded-none font-normal text-xs sm:w-auto"
                    >
                      {isSubmitting && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                      {dictionary_t.form.submit}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="bg-background">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="font-medium text-xs">{dictionary_t.table.name}</TableHead>
                  <TableHead className="w-[100px] text-right font-medium text-xs">
                    {dictionary_t.table.actions}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <SortableContext items={items} strategy={verticalListSortingStrategy}>
                  {items.length > 0 ? (
                    items.map((category) => (
                      <SortableRow
                        key={category.id}
                        category={category}
                        handleEdit={handleEdit}
                        handleDeleteClick={handleDeleteClick}
                      />
                    ))
                  ) : (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={2} className="h-32 text-center text-muted-foreground text-xs">
                        {dictionary_t.empty}
                      </TableCell>
                    </TableRow>
                  )}
                </SortableContext>
              </TableBody>
            </Table>
          </DndContext>
        </div>
      </div>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="max-w-sm rounded-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-medium text-base tracking-tight">
              {dictionary_t.form.delete}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">{dictionary_t.form.delete_confirm}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="pt-2">
            <AlertDialogCancel disabled={deleteMutation.isPending} className="h-8 rounded-none font-normal text-xs">
              {dictionary_t.form.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (categoryToDelete) {
                  deleteMutation.mutate(categoryToDelete.id);
                }
              }}
              disabled={deleteMutation.isPending}
              className="h-8 rounded-none bg-destructive font-normal text-destructive-foreground text-xs hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              {dictionary_t.form.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
