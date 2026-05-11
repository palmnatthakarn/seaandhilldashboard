import { filterBranchesForCurrentUser, parseRequestedBranches } from "@/lib/auth-policy";

export async function getAuthorizedBranches(searchParams: URLSearchParams) {
  const requestedBranches = parseRequestedBranches(searchParams);
  return filterBranchesForCurrentUser(requestedBranches);
}
