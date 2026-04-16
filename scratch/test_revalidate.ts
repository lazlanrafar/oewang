// Mocking the behavior for test
function revalidateTag(tag: string, profile: string) {
  console.log('Revalidating', tag, 'with profile', profile);
}

// Case 1: Direct call (what fails tsc or IDE)
// revalidateTag("transactions"); 

// Case 2: Tuple spread
const args: [string, string] = ["transactions", "profile"];
revalidateTag(...args);

// Case 3: Typed cast without 'any'
type RevalidateFn = {
  (tag: string): void;
  (tag: string, profile: string): void;
};

(revalidateTag as RevalidateFn)("transactions", "profile");
