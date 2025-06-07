import React from 'react';
import { InqProducts } from '@/integrations/supabase/types'; // Adjust path if necessary
import { ShoppingCart, Tag } from 'lucide-react'; // Example icons
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ProductInterestsListProps {
  products: InqProducts[];
  isLoading?: boolean;
}

export function ProductInterestsList({ products, isLoading }: ProductInterestsListProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Product Interests</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-8 bg-gray-200 rounded animate-pulse"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!products || products.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Product Interests</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-4">
            <ShoppingCart className="w-12 h-12 text-gray-400 mb-2" />
            <p className="text-sm text-muted-foreground">No product interests identified in this email.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-lg shadow-md">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Product Interests</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {products.map((product) => (
            <Badge key={product.interest_id} variant="outline" className="text-sm">
              <Tag className="mr-1 h-3 w-3" />
              {product.product_name || 'N/A'}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
