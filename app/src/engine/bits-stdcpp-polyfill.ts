/**
 * libc++ doesn't ship a `<bits/stdc++.h>` convenience header (that's a libstdc++
 * convention). GPE-style code relies on it heavily.
 *
 * Solution: install this string into emception's virtual filesystem at
 * /working/bits/stdc++.h at init time, then pass `-I/working` to em++.
 *
 * Spike validation: Phase 0 confirmed this polyfill compiles sample.cpp
 * successfully against emception's libc++.
 */
export const BITS_STDCPP_POLYFILL = `// bits/stdc++.h polyfill for libc++. Includes the common standard headers
// that competitive-programming and GPE-style code expects to be available.
#pragma once
#include <cassert>
#include <cctype>
#include <cerrno>
#include <cfloat>
#include <climits>
#include <clocale>
#include <cmath>
#include <csetjmp>
#include <csignal>
#include <cstdarg>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <cwchar>
#include <cwctype>
#include <algorithm>
#include <array>
#include <atomic>
#include <bitset>
#include <chrono>
#include <complex>
#include <deque>
#include <exception>
#include <forward_list>
#include <fstream>
#include <functional>
#include <initializer_list>
#include <iomanip>
#include <ios>
#include <iosfwd>
#include <iostream>
#include <istream>
#include <iterator>
#include <limits>
#include <list>
#include <locale>
#include <map>
#include <memory>
#include <new>
#include <numeric>
#include <ostream>
#include <queue>
#include <random>
#include <ratio>
#include <regex>
#include <set>
#include <sstream>
#include <stack>
#include <stdexcept>
#include <streambuf>
#include <string>
#include <tuple>
#include <type_traits>
#include <typeindex>
#include <typeinfo>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <valarray>
#include <vector>
`
