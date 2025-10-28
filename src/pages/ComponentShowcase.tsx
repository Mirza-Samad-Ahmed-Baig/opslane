import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon, ArrowLeft, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { isMacOS } from '@/utils/platform';
import { WindowControls } from '@/components/WindowControls';
import { Alert } from '@/components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
} from '@/components/ui/alert-dialog';
import { SessionStatusBadge } from '@/components/SessionStatusBadge';

/**
 * ComponentShowcase - Visual playground for all UI components
 *
 * Features:
 * - Display all components with variants
 * - Live theme toggle
 * - Interactive controls
 * - Responsive grid layout
 */
export function ComponentShowcase() {
  const { theme, setTheme } = useTheme();
  const [inputValue, setInputValue] = useState('');

  // Platform detection for titlebar
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(isMacOS());
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b sticky top-0 bg-background z-10 titlebar-drag-region">
        <div
          className={`container mx-auto px-6 py-4 flex items-center justify-between ${isMac ? 'macos-traffic-lights-padding' : ''}`}
        >
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Component Showcase</h1>
              <p className="text-sm text-muted-foreground">
                Visual playground for all UI components
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <WindowControls />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        <div className="space-y-12">
          {/* Section: Buttons */}
          <section>
            <h2 className="text-xl font-semibold mb-4">Buttons</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Default Variant</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button variant="default" className="w-full">
                    Default
                  </Button>
                  <Button variant="default" size="sm" className="w-full">
                    Small
                  </Button>
                  <Button variant="default" size="lg" className="w-full">
                    Large
                  </Button>
                  <Button variant="default" disabled className="w-full">
                    Disabled
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Destructive Variant</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button variant="destructive" className="w-full">
                    Destructive
                  </Button>
                  <Button variant="destructive" size="sm" className="w-full">
                    Small
                  </Button>
                  <Button variant="destructive" disabled className="w-full">
                    Disabled
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Outline Variant</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button variant="outline" className="w-full">
                    Outline
                  </Button>
                  <Button variant="outline" size="sm" className="w-full">
                    Small
                  </Button>
                  <Button variant="outline" disabled className="w-full">
                    Disabled
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Secondary Variant</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button variant="secondary" className="w-full">
                    Secondary
                  </Button>
                  <Button variant="secondary" size="sm" className="w-full">
                    Small
                  </Button>
                  <Button variant="secondary" disabled className="w-full">
                    Disabled
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Ghost Variant</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button variant="ghost" className="w-full">
                    Ghost
                  </Button>
                  <Button variant="ghost" size="sm" className="w-full">
                    Small
                  </Button>
                  <Button variant="ghost" disabled className="w-full">
                    Disabled
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Link Variant</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button variant="link" className="w-full">
                    Link
                  </Button>
                  <Button variant="link" size="sm" className="w-full">
                    Small
                  </Button>
                  <Button variant="link" disabled className="w-full">
                    Disabled
                  </Button>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Section: Status Badges */}
          <section>
            <h2 className="text-xl font-semibold mb-4">Status Badges</h2>
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-wrap gap-3">
                  <SessionStatusBadge status="created" />
                  <SessionStatusBadge status="cloning" />
                  <SessionStatusBadge status="ready" />
                  <SessionStatusBadge status="error" />
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Section: Alerts */}
          <section>
            <h2 className="text-xl font-semibold mb-4">Alerts</h2>
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Alert Variants</CardTitle>
                  <CardDescription>Theme-aware status alerts with semantic colors</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Alert variant="info">
                    This is an informational message. Session is being created.
                  </Alert>
                  <Alert variant="warning">
                    Docker is not running. Start Docker to create sessions.
                  </Alert>
                  <Alert variant="success">
                    Session created successfully! Container is now ready.
                  </Alert>
                  <Alert variant="error">
                    Failed to create session. Docker daemon not accessible.
                  </Alert>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Alerts with Titles</CardTitle>
                  <CardDescription>Structured alerts with bold titles</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Alert variant="info" title="Session Starting">
                    Your development environment is being initialized. This may take a moment.
                  </Alert>
                  <Alert variant="warning" title="Docker Not Available">
                    Please start Docker Desktop before creating a session. Sessions require Docker
                    containers.
                  </Alert>
                  <Alert variant="success" title="Ready to Code">
                    Your session is ready! Open the terminal or start chatting with Claude.
                  </Alert>
                  <Alert variant="error" title="Connection Failed">
                    Unable to connect to the Docker daemon. Check that Docker is running and try
                    again.
                  </Alert>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Alerts with Custom Icons</CardTitle>
                  <CardDescription>Using custom icons like loading spinners</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Alert variant="info" icon={Loader2} className="[&_svg]:animate-spin">
                    Cloning repository... This may take a few minutes for large repositories.
                  </Alert>
                </CardContent>
              </Card>

              <div className="mt-4 p-4 bg-muted rounded-lg">
                <h3 className="text-sm font-semibold mb-2">Color Token System</h3>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>
                    <strong>Info (Blue):</strong> status-info-bg, status-info-fg, status-info-border
                  </p>
                  <p>
                    <strong>Warning (Yellow):</strong> status-warning-bg, status-warning-fg,
                    status-warning-border
                  </p>
                  <p>
                    <strong>Success (Green):</strong> status-success-bg, status-success-fg,
                    status-success-border
                  </p>
                  <p>
                    <strong>Error (Red):</strong> status-error-bg, status-error-fg,
                    status-error-border
                  </p>
                  <p className="mt-2 text-xs">
                    All colors automatically adapt to light/dark themes and meet WCAG AAA
                    accessibility standards (7:1+ contrast).
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Section: Cards */}
          <section>
            <h2 className="text-xl font-semibold mb-4">Cards</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Basic Card</CardTitle>
                  <CardDescription>This is a card description</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Card content goes here with some example text.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Card with Footer</CardTitle>
                  <CardDescription>Card with action buttons</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    This card has a footer with buttons.
                  </p>
                </CardContent>
                <CardFooter className="gap-2">
                  <Button variant="outline" size="sm">
                    Cancel
                  </Button>
                  <Button size="sm">Action</Button>
                </CardFooter>
              </Card>

              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle>Subtle Border Card</CardTitle>
                  <CardDescription>With 50% border opacity</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    This card has a more subtle border.
                  </p>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Section: Inputs */}
          <section>
            <h2 className="text-xl font-semibold mb-4">Inputs</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Text Input</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="normal">Normal</Label>
                    <Input
                      id="normal"
                      placeholder="Enter text..."
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="disabled">Disabled</Label>
                    <Input id="disabled" placeholder="Disabled input" disabled />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="error">With Error</Label>
                    <Input id="error" placeholder="Error state" className="border-destructive" />
                    <p className="text-xs text-destructive">This field has an error</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Input Types</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" placeholder="email@example.com" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input id="password" type="password" placeholder="••••••••" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="number">Number</Label>
                    <Input id="number" type="number" placeholder="123" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Section: Dialogs */}
          <section>
            <h2 className="text-xl font-semibold mb-4">Dialogs</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Standard Dialog</CardTitle>
                  <CardDescription>Modal with form content</CardDescription>
                </CardHeader>
                <CardContent>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline">Open Dialog</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Example Dialog</DialogTitle>
                        <DialogDescription>
                          This is a standard dialog with form inputs.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="name">Name</Label>
                          <Input id="name" placeholder="Enter your name" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="email-dialog">Email</Label>
                          <Input id="email-dialog" type="email" placeholder="email@example.com" />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline">Cancel</Button>
                        <Button>Submit</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Alert Dialog</CardTitle>
                  <CardDescription>Destructive confirmation</CardDescription>
                </CardHeader>
                <CardContent>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive">Delete Something</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This action cannot be undone. This will permanently delete the item.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Section: Typography */}
          <section>
            <h2 className="text-xl font-semibold mb-4">Typography</h2>
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div>
                  <h1 className="text-2xl font-bold">Heading 1 (2xl)</h1>
                  <p className="text-xs text-muted-foreground">text-2xl font-bold</p>
                </div>
                <div>
                  <h2 className="text-xl font-semibold">Heading 2 (xl)</h2>
                  <p className="text-xs text-muted-foreground">text-xl font-semibold</p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Heading 3 (lg)</h3>
                  <p className="text-xs text-muted-foreground">text-lg font-semibold</p>
                </div>
                <div>
                  <p className="text-base">Body text (base)</p>
                  <p className="text-xs text-muted-foreground">text-base</p>
                </div>
                <div>
                  <p className="text-sm">Small text (sm)</p>
                  <p className="text-xs text-muted-foreground">text-sm</p>
                </div>
                <div>
                  <p className="text-xs">Extra small text (xs)</p>
                  <p className="text-xs text-muted-foreground">text-xs</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Muted foreground text</p>
                  <p className="text-xs text-muted-foreground">text-muted-foreground</p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Section: Colors */}
          <section>
            <h2 className="text-xl font-semibold mb-4">Color Palette</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Background Colors</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="p-4 rounded bg-background border">
                    <p className="text-sm">background</p>
                  </div>
                  <div className="p-4 rounded bg-card border">
                    <p className="text-sm">card</p>
                  </div>
                  <div className="p-4 rounded bg-muted border">
                    <p className="text-sm">muted</p>
                  </div>
                  <div className="p-4 rounded bg-secondary border">
                    <p className="text-sm">secondary</p>
                  </div>
                  <div className="p-4 rounded bg-accent border">
                    <p className="text-sm">accent</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Semantic Colors</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="p-4 rounded bg-primary text-primary-foreground">
                    <p className="text-sm font-medium">primary</p>
                  </div>
                  <div className="p-4 rounded bg-destructive text-destructive-foreground">
                    <p className="text-sm font-medium">destructive</p>
                  </div>
                  <div className="p-4 rounded border border-border">
                    <p className="text-sm">border</p>
                  </div>
                  <div className="p-4 rounded border border-input">
                    <p className="text-sm">input border</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Text Colors</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-foreground">foreground</p>
                  <p className="text-muted-foreground">muted-foreground</p>
                  <p className="text-primary">primary</p>
                  <p className="text-destructive">destructive</p>
                  <p className="text-card-foreground">card-foreground</p>
                </CardContent>
              </Card>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
