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
  AlertDialogTrigger,
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

import {
  createCategory,
  deleteCategory,
  getExpenseCategories,
  getIncomeCategories,
  reorderCategories,
  updateCategory,
} from "@workspace/modules";

interface CategoryFormProps {
  type: "income" | "expense";
  dictionary: {
    title: string;
    description: string;
    add_button: string;
    empty: string;
    table: {
      name: string;
      color: string;
      actions: string;
    };
    form: {
      name: {
        label: string;
        placeholder: string;
        error_required: string;
      };
      color: {
        label: string;
        placeholder: string;
      };
      submit: string;
      cancel: string;
      delete: string;
      delete_confirm: string;
      delete_success: string;
      create_success: string;
      update_success: string;
    };
  };
}

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
      {/* <TableCell className="w-[20px]">
        <Button
          variant="ghost"
          size="icon"
          className="cursor-move"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </Button>
      </TableCell> */}
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

export function CategoryForm({ type, dictionary }: CategoryFormProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [activeCategory, setActiveCategory] = React.useState<Category | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [categoryToDelete, setCategoryToDelete] = React.useState<Category | null>(null);
  const [items, setItems] = React.useState<Category[]>([]);

  const queryClient = useQueryClient();
  const queryKey = ["categories", type];

  // Schema matches dictionary messages
  const formSchema = z.object({
    name: z.string().min(1, { message: dictionary.form.name.error_required }),
  });

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

    if (active.id !== over?.id) {
      setItems((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over?.id);

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
      toast.success(dictionary.form.create_success);
      setIsOpen(false);
      form.reset();
    },
    onError: (error) => {
      toast.error(`Error: ${(error as Error).message}`);
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
      toast.success(dictionary.form.update_success);
      setIsOpen(false);
      setActiveCategory(null);
      form.reset();
    },
    onError: (error) => {
      toast.error(`Error: ${(error as Error).message}`);
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
      toast.success(dictionary.form.delete_success);
      setIsDeleteDialogOpen(false);
      setCategoryToDelete(null);
    },
    onError: (error) => {
      toast.error(`Error: ${(error as Error).message}`);
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
      toast.error(`Failed to reorder: ${(error as Error).message}`);
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

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div>
          <h4 className="text-base font-medium">{dictionary.title}</h4>
          <p className="text-sm text-muted-foreground">{dictionary.description}</p>
        </div>
        <div className="flex justify-end">
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h4 className="text-base font-medium">{dictionary.title}</h4>
          <p className="text-sm text-muted-foreground">{dictionary.description}</p>
        </div>
        <Dialog open={isOpen} onOpenChange={handleDialogChange}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              {dictionary.add_button}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{activeCategory ? dictionary.form.submit : dictionary.add_button}</DialogTitle>
              <DialogDescription>{activeCategory ? dictionary.description : dictionary.description}</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{dictionary.form.name.label}</FormLabel>
                      <FormControl>
                        <Input placeholder={dictionary.form.name.placeholder} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {dictionary.form.submit}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border rounded-md">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <Table>
            <TableHeader>
              <TableRow>
                {/* <TableHead className="w-[50px]"></TableHead> */}
                <TableHead>{dictionary.table.name}</TableHead>
                <TableHead className="w-[100px] text-right">{dictionary.table.actions}</TableHead>
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
                  <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                      {dictionary.empty}
                    </TableCell>
                  </TableRow>
                )}
              </SortableContext>
            </TableBody>
          </Table>
        </DndContext>
      </div>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dictionary.form.delete}</AlertDialogTitle>
            <AlertDialogDescription>{dictionary.form.delete_confirm}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>{dictionary.form.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (categoryToDelete) {
                  deleteMutation.mutate(categoryToDelete.id);
                }
              }}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {dictionary.form.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
