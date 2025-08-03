export async function fetchAliExpressProducts(searchQuery = "tech", limit = 10) {
  console.log("[1] Starting fetchAliExpressProducts with query:", searchQuery);
  
  const url = `https://aliexpress-datahub.p.rapidapi.com/item_search?q=${encodeURIComponent(searchQuery)}&page=1&pageSize=${limit}`;
  console.log("[2] API URL:", url);

  const options = {
    method: 'GET',
    headers: {
      'X-RapidAPI-Key': process.env.NEXT_PUBLIC_RAPIDAPI_KEY,
      'X-RapidAPI-Host': 'aliexpress-datahub.p.rapidapi.com'
    }
  };
  console.log("[3] Request options:", options);

  try {
    console.log("[4] Making API request...");
    const response = await fetch(url, options);
    console.log("[5] Response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[6] API Error response:", errorText);
      throw new Error(`API request failed with status ${response.status}`);
    }

    const data = await response.json();
    console.log("[7] API Response data:", data);
    
    const items = data.result?.itemList?.map(item => ({
      id: `aliexpress_${item.itemId}`,
      title: item.title,
      image: item.image,
      price: item.price,
      itemId: item.itemId
    })) || [];

    console.log("[8] Processed items:", items);
    return items;

  } catch (error) {
    console.error("[9] Full error details:", {
      message: error.message,
      stack: error.stack,
      config: { url, options }
    });
    return [];
  }
}