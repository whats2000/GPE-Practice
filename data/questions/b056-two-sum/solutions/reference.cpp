#include <bits/stdc++.h>
using namespace std;
int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(nullptr);
    int n;
    long long target;
    cin >> n >> target;
    vector<long long> a(n);
    for (int i = 0; i < n; ++i) cin >> a[i];
    unordered_map<long long, int> seen;
    for (int i = 0; i < n; ++i) {
        auto it = seen.find(target - a[i]);
        if (it != seen.end()) {
            cout << it->second << " " << i << "\n";
            return 0;
        }
        seen[a[i]] = i;
    }
    // Unreachable given the "exactly one solution" guarantee
    return 1;
}
